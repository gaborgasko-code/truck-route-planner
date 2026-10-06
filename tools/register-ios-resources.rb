#!/usr/bin/env ruby
# frozen_string_literal: true
#
# Truck Route Planner - register the staged resources in the Xcode project.
#
#     ruby tools/register-ios-resources.rb
#
# Copying a file into ios/App/App is not enough: Xcode bundles only what
# project.pbxproj references, and ignores everything else in the folder without
# a word. That is exactly how the privacy manifest and all 24 localisations
# were left out of a build that reported success at every step.
#
# This adds them properly, with the xcodeproj gem - the library CocoaPods uses,
# so it is already present wherever `pod install` runs:
#
#   PrivacyInfo.xcprivacy    a file reference in the App group, added to the
#                            Copy Bundle Resources phase
#   InfoPlist.strings        a variant group with one child per language, which
#                            is how Xcode represents a localised file; it then
#                            builds <lang>.lproj/InfoPlist.strings for each
#
# Idempotent: running it twice changes nothing the second time, because
# `cap sync` and reruns must not stack up duplicate references.
#
# created by Gabor Gasko

require 'json'
require 'xcodeproj'

ROOT = File.expand_path('..', __dir__)
PROJECT = File.join(ROOT, 'ios', 'App', 'App.xcodeproj')
APP_DIR = File.join(ROOT, 'ios', 'App', 'App')
LANGS_FILE = File.join(ROOT, 'ios-resources', 'CFBundleLocalizations.json')

abort "no Xcode project at #{PROJECT} - run `npx cap add ios` first" unless File.directory?(PROJECT)
abort "missing #{LANGS_FILE} - run tools/build-ios-resources.js first" unless File.exist?(LANGS_FILE)

langs = JSON.parse(File.read(LANGS_FILE))

# The files must already be on disk; registering a reference to nothing would
# only move the failure into the build.
abort 'PrivacyInfo.xcprivacy has not been copied into ios/App/App' \
  unless File.exist?(File.join(APP_DIR, 'PrivacyInfo.xcprivacy'))
absent = langs.reject { |l| File.exist?(File.join(APP_DIR, "#{l}.lproj", 'InfoPlist.strings')) }
abort "InfoPlist.strings missing on disk for: #{absent.join(' ')}" unless absent.empty?

project = Xcodeproj::Project.open(PROJECT)
target = project.targets.find { |t| t.name == 'App' } or abort 'no App target in the project'
group = project.main_group.find_subpath('App', false) or abort 'no App group in the project'
resources = target.resources_build_phase

# --- privacy manifest -------------------------------------------------------

manifest = group.files.find { |f| f.path == 'PrivacyInfo.xcprivacy' } ||
           group.new_reference('PrivacyInfo.xcprivacy')
resources.add_file_reference(manifest, true)

# --- localised InfoPlist.strings ---------------------------------------------

variant = group.children.find do |child|
  child.isa == 'PBXVariantGroup' && child.name == 'InfoPlist.strings'
end
variant ||= group.new_variant_group('InfoPlist.strings')

langs.each do |lang|
  relative = "#{lang}.lproj/InfoPlist.strings"
  next if variant.files.any? { |f| f.path == relative }

  ref = variant.new_reference(relative)
  ref.name = lang
end
resources.add_file_reference(variant, true)

# Xcode lists the regions a project is localised into; keep it truthful.
root_object = project.root_object
root_object.known_regions = (root_object.known_regions + langs + ['Base']).uniq

project.save

registered = variant.files.map(&:name).sort
puts "Xcode project: PrivacyInfo.xcprivacy + InfoPlist.strings in #{registered.size} languages registered"
