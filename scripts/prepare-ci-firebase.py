#!/usr/bin/env python3
"""Generate disposable Firebase configuration for compilation and isolated CI tests.

The generated app IDs and API-key-shaped placeholder are not registered credentials.
Never copy these generated files into a production configuration.
"""
import argparse
import json
from pathlib import Path
import plistlib


def android_config():
    clients = []
    for package in ('dev.kigya.pixora', 'dev.kigya.pixora.debug'):
        clients.append({
            'client_info': {
                'mobilesdk_app_id': '1:123456789012:android:0000000000000000',
                'android_client_info': {'package_name': package},
            },
            'oauth_client': [],
            'api_key': [{'current_key': 'AI' + 'za' + '0' * 35}],
            'services': {'appinvite_service': {'other_platform_oauth_client': []}},
        })
    return {
        'project_info': {'project_number': '123456789012', 'project_id': 'pixora-ci-placeholder'},
        'client': clients, 'configuration_version': '1',
    }


def ios_config(debug=False):
    return {
        'API_KEY': 'AI' + 'za' + '0' * 35,
        'GCM_SENDER_ID': '123456789012', 'PLIST_VERSION': '1',
        'BUNDLE_ID': 'dev.kigya.pixora.debug' if debug else 'dev.kigya.pixora',
        'PROJECT_ID': 'pixora-ci-placeholder',
        'GOOGLE_APP_ID': '1:123456789012:ios:0000000000000000',
        'IS_ADS_ENABLED': False, 'IS_ANALYTICS_ENABLED': False,
        'IS_APPINVITE_ENABLED': False, 'IS_GCM_ENABLED': False,
        'IS_SIGNIN_ENABLED': False,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--android-output', type=Path)
    parser.add_argument('--android-manifest-output', type=Path)
    parser.add_argument('--ios-root', type=Path)
    parser.add_argument('--ios-info-plist', type=Path)
    parser.add_argument('--ios-ci-info', type=Path)
    parser.add_argument('--feedback-properties-output', type=Path)
    args = parser.parse_args(argv)
    if not args.android_output and not args.ios_root and not args.feedback_properties_output:
        parser.error('Specify --android-output, --ios-root or --feedback-properties-output.')
    if args.android_output:
        args.android_output.parent.mkdir(parents=True, exist_ok=True)
        contents = json.dumps(android_config(), indent=2) + '\n'
        if args.android_output.exists() and args.android_output.read_text() != contents:
            raise SystemExit('Refusing to overwrite an existing Firebase configuration.')
        args.android_output.write_text(contents)
    if args.android_manifest_output:
        args.android_manifest_output.parent.mkdir(parents=True, exist_ok=True)
        args.android_manifest_output.write_text(
            '<manifest xmlns:android="http://schemas.android.com/apk/res/android" '
            'xmlns:tools="http://schemas.android.com/tools">\n'
            '  <uses-permission android:name="android.permission.INTERNET" tools:node="remove" />\n'
            '  <application><meta-data android:name="firebase_analytics_collection_deactivated" '
            'android:value="true" /></application>\n</manifest>\n')
    if args.ios_root:
        for config in ('Debug', 'Release'):
            contents = plistlib.dumps(ios_config(config == 'Debug'))
            target = args.ios_root / config / 'GoogleService-Info.plist'
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                if target.read_bytes() == contents:
                    continue
                raise SystemExit('Refusing to overwrite an existing Firebase configuration.')
            target.write_bytes(contents)
    if bool(args.ios_info_plist) != bool(args.ios_ci_info):
        parser.error('--ios-info-plist and --ios-ci-info must be used together.')
    if args.ios_ci_info:
        if args.ios_ci_info.resolve() == args.ios_info_plist.resolve():
            parser.error('CI Info.plist output must be separate from the application source.')
        data = plistlib.loads(args.ios_info_plist.read_bytes())
        data['FIREBASE_ANALYTICS_COLLECTION_DEACTIVATED'] = True
        data['FirebaseCrashlyticsCollectionEnabled'] = False
        args.ios_ci_info.parent.mkdir(parents=True, exist_ok=True)
        args.ios_ci_info.write_bytes(plistlib.dumps(data))
    if args.feedback_properties_output:
        contents = 'endpoint=https://script.google.com/macros/s/pixora-ci-placeholder/exec\n'
        target = args.feedback_properties_output
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and target.read_text() != contents:
            raise SystemExit('Refusing to overwrite existing feedback configuration.')
        target.write_text(contents)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
