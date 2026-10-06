#!/usr/bin/env ruby
# frozen_string_literal: true
#
# Truck Route Planner - switch the App target to manual signing for CI.
#
#     ruby tools/configure-ios-signing.rb TEAM_ID "Profile Name"
#     ruby tools/configure-ios-signing.rb --check
#
# Capacitor's template signs automatically, which on a CI runner means
# xcodebuild tries to reach Apple through an Xcode account login that does not
# exist there, and the archive fails. Manual signing with the profile the
# workflow installed is the fix - but it has to go on the App target ALONE.
# Passing CODE_SIGN_STYLE or PROVISIONING_PROFILE_SPECIFIER on the xcodebuild
# command line applies them to every target, and the Capacitor pod targets then
# fail with "does not support provisioning profiles".
#
# --check opens the project and confirms the target and Release configuration
# exist without changing anything. The unsigned build runs it every time, so a
# change in Capacitor's template breaks loudly there, long before a release.
#
# created by Gabor Gasko

require 'xcodeproj'

ROOT = File.expand_path('..', __dir__)
PROJECT = File.join(ROOT, 'ios', 'App', 'App.xcodeproj')

abort "no Xcode project at #{PROJECT}" unless File.directory?(PROJECT)

project = Xcodeproj::Project.open(PROJECT)
target = project.targets.find { |t| t.name == 'App' } or abort 'no App target in the project'
release = target.build_configurations.find { |c| c.name == 'Release' } or
  abort 'the App target has no Release configuration'

if ARGV.first == '--check'
  style = release.build_settings['CODE_SIGN_STYLE'] || '(default)'
  puts "Signing check: App target and Release configuration found (signing style #{style})"
  exit 0
end

team, profile = ARGV
abort 'usage: configure-ios-signing.rb TEAM_ID "Profile Name"' unless team && profile
abort "a team id is ten characters, got #{team.inspect}" unless team.match?(/\A[A-Z0-9]{10}\z/)

settings = release.build_settings
settings['CODE_SIGN_STYLE'] = 'Manual'
settings['DEVELOPMENT_TEAM'] = team
settings['CODE_SIGN_IDENTITY'] = 'Apple Distribution'
settings['CODE_SIGN_IDENTITY[sdk=iphoneos*]'] = 'Apple Distribution'
settings['PROVISIONING_PROFILE_SPECIFIER'] = profile

project.save
puts "App target, Release: manual signing as team #{team} with profile #{profile.inspect}"
