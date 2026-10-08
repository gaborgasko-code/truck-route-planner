#!/usr/bin/env ruby
# frozen_string_literal: true
#
# Truck Route Planner - set the iOS version and devices the app is built for.
#
#     ruby tools/configure-ios-platform.rb
#
# `cap add ios` creates the project for iOS 14 on iPhone and iPad. App Store
# Connect warns about iOS 14 already and refuses it from April 2027, and an
# iPad build would need its own screenshots and review. The values live in
# tools/ios-platform.json; this writes them into the Xcode project, at project
# level and on the App target, for every build configuration.
#
# The Podfile carries the same deployment target and is patched before
# `cap sync` (see the workflow), because CocoaPods reads it during install.
#
# Idempotent.

require 'json'
require 'xcodeproj'

ROOT = File.expand_path('..', __dir__)
PROJECT = File.join(ROOT, 'ios', 'App', 'App.xcodeproj')
PLATFORM = JSON.parse(File.read(File.join(__dir__, 'ios-platform.json')))

abort "no Xcode project at #{PROJECT} - run `npx cap add ios` first" unless File.directory?(PROJECT)

target_os = PLATFORM.fetch('deploymentTarget')
family = PLATFORM.fetch('deviceFamily')

project = Xcodeproj::Project.open(PROJECT)
app = project.targets.find { |t| t.name == 'App' } or abort 'no App target in the project'

(project.build_configurations + app.build_configurations).each do |config|
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = target_os
end
app.build_configurations.each do |config|
  config.build_settings['TARGETED_DEVICE_FAMILY'] = family
end

project.save

configs = app.build_configurations.map(&:name).join(', ')
puts "Xcode project: iOS #{target_os}, device family #{family} (#{configs})"
