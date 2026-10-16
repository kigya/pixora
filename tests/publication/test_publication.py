"""Publication-policy regressions use temporary repositories, never real credentials."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import plistlib
import runpy
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


guard = load('guard', 'check-publication.py')
firebase = load('ci_firebase', 'prepare-ci-firebase.py')


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.previous = Path.cwd()
        os.chdir(self.root)
        self.git('init', '-q')
        self.git('config', 'user.name', 'Publication Test')
        self.git('config', 'user.email', 'test@example.invalid')

    def tearDown(self):
        os.chdir(self.previous)
        self.temp.cleanup()

    def git(self, *args):
        return subprocess.check_output(['git', *args], stderr=subprocess.DEVNULL).decode().strip()

    def stage(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        self.git('add', '-f', name)

    def test_forbidden_paths_and_permitted_product_files(self):
        for name in ['.agents/skills/a/SKILL.md', '.p-build-app/state.json', 'AGENTS.md',
                     'docs/agent-reports/a.md', 'docs/research/a.md', 'artifacts/a.png',
                     'coverage/result.json', 'node_modules/a.js', 'android/app/build/a.txt',
                     'android/app/google-services.json', 'ios/Config/Debug/GoogleService-Info.plist',
                     'signing.properties', '.env', '.env.production', 'debug.keystore',
                     'capture.LOG', 'docs/project-status.md', 'docs/quality/coverage.md',
                     'docs/product/.gitignore',
                     'vendor/ncnn/sdk/lib.a', 'vendor/bundle/gems/a.rb', 'ios/Vendor/sdk/lib.a',
                     '.coverage', '.coverage.worker', '.pytest_cache/state', 'docs/\u0442\u0435\u0441\u0442.md',
                     'docs/VALIDATION-1.md', 'docs/PLAN-1.md', 'scripts/ios-project/.build/a']:
            with self.subTest(name=name):
                self.assertTrue(guard.private_path(name))
        for name in ['README.md', '.github/PULL_REQUEST_TEMPLATE.md', '.bundle/config',
                     '.env.example', 'android/app/build.gradle', 'docs/PRD.md',
                     'docs/quality/test-matrix.md', 'docs/security-tools.json', 'src/locales/ru.json']:
            with self.subTest(name=name):
                self.assertFalse(guard.private_path(name))

    def test_secret_material_in_normal_source_or_binary_is_rejected(self):
        values = ['AI' + 'za' + 'S' * 35, 'gh' + 'p_' + 'x' * 36,
                  'github_' + 'pat_' + 'x' * 60, 'AK' + 'IA' + 'A' * 16,
                  '-----BEGIN ' + 'PRIVATE KEY-----', '{"type":"service_' + 'account"}',
                  'sk_' + 'live_' + 'x' * 30]
        for value in values:
            self.assertIn('credential material', guard.content_issues('src/config.ts', value.encode()))
        self.assertIn('credential material', guard.content_issues('image.bin', b'\xff' + values[0].encode()))
        self.assertEqual([], guard.content_issues('image.bin', b'\xff\x00'))

    def test_language_exceptions_are_data_only(self):
        localized = '\u0420\u0443\u0441\u0441\u043a\u0438\u0439'
        self.assertTrue(guard.content_issues('.github/PULL_REQUEST_TEMPLATE.md', localized.encode()))
        self.assertTrue(guard.content_issues('src/locales/readme.md', localized.encode()))
        self.assertEqual([], guard.content_issues('src/locales/ru.json', json.dumps({'name': localized}, ensure_ascii=False).encode()))
        self.assertEqual([], guard.content_issues('src/locales/registry.json', json.dumps([{'name': localized}], ensure_ascii=False).encode()))
        self.assertTrue(guard.content_issues('src/locales/ru.json', localized.encode()))
        self.assertTrue(guard.content_issues('src/locales/ru.json', json.dumps(localized, ensure_ascii=False).encode()))
        self.assertEqual([], guard.content_issues('tests/a.py', b'name = "\\u0420"'))

    def test_personal_paths_and_symlinks(self):
        self.assertTrue(guard.content_issues('link', b'/private/tool', '120000'))
        self.assertTrue(guard.content_issues('link', b'../../private/tool', '120000'))
        self.assertEqual([], guard.content_issues('link', b'src/tool', '120000'))
        self.assertTrue(guard.content_issues('README.md', b'/Users/' + b'test/Documents/app'))
        self.assertTrue(guard.content_issues('README.md', b'/home/' + b'test/app'))

    def test_staged_contents_not_worktree_and_force_add(self):
        self.stage('README.md', 'English product documentation.\n')
        (self.root / 'README.md').write_text('AI' + 'za' + 'X' * 35)
        self.assertEqual([], guard.check([None, None]))
        self.stage('.gitignore', '*.log\n')
        self.stage('private.log', 'Local output')
        self.assertTrue(guard.check([None]))
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(1, guard.main(['--staged']))

    def test_deleted_secret_still_blocks_history(self):
        self.stage('src/config.ts', 'AI' + 'za' + 'X' * 35)
        self.git('commit', '-qm', 'Add temporary fixture')
        self.git('rm', '-q', 'src/config.ts')
        self.stage('README.md', 'Clean product text')
        self.git('commit', '-qm', 'Remove fixture')
        self.assertEqual([], guard.check(['HEAD']))
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(1, guard.main(['--history', 'HEAD']))
            line = f'refs/heads/main {self.git("rev-parse", "HEAD")} refs/heads/main {"0" * 40}\n'
            self.assertEqual(1, guard.main(['--pre-push'], stdin=line))

    def test_clean_history_and_deletion_push(self):
        self.stage('README.md', 'English')
        self.git('commit', '-qm', 'Initial product')
        self.assertEqual(0, guard.main(['--history', 'HEAD']))
        self.assertEqual([], guard.outgoing(f'refs/heads/a {"0" * 40} refs/heads/a {"1" * 40}\n'))
        self.assertEqual(0, guard.main(['--pre-push'], stdin=''))
        with patch('sys.stdin', io.StringIO('')):
            self.assertEqual(0, guard.main(['--pre-push']))
        with self.assertRaises(ValueError):
            guard.outgoing('invalid record')

    def test_commit_message(self):
        message = self.root / 'message'
        message.write_text('Describe the change')
        self.assertEqual(0, guard.main(['--message-file', str(message)]))
        message.write_text('\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0435')
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(1, guard.main(['--message-file', str(message)]))

    def test_non_english_historical_message_is_blocked(self):
        self.stage('README.md', 'English')
        self.git('commit', '-qm', '\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0435')
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(1, guard.main(['--history', 'HEAD']))

    def test_cli_entrypoints_fail_closed(self):
        self.stage('README.md', 'English')
        with patch('sys.argv', ['check-publication.py', '--staged']):
            with self.assertRaises(SystemExit) as result:
                runpy.run_path(str(ROOT / 'scripts/check-publication.py'), run_name='__main__')
            self.assertEqual(0, result.exception.code)
        with patch('sys.argv', ['check-publication.py', '--pre-push']), patch('sys.stdin', io.StringIO('bad record')):
            with contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as result:
                    runpy.run_path(str(ROOT / 'scripts/check-publication.py'), run_name='__main__')
            self.assertEqual(1, result.exception.code)
        with patch('sys.argv', ['prepare-ci-firebase.py', '--android-output', str(self.root / 'generated.json')]):
            with self.assertRaises(SystemExit) as result:
                runpy.run_path(str(ROOT / 'scripts/prepare-ci-firebase.py'), run_name='__main__')
            self.assertEqual(0, result.exception.code)

    def test_hooks_chain_and_reinstall(self):
        scanner = self.root / '.p-build-app/local/bin/gitleaks'
        scanner.parent.mkdir(parents=True)
        scanner.write_text('#!/bin/sh\nprintf "%s\\n" "$@" >> .scanner-arguments\n')
        scanner.chmod(0o700)
        hook = self.root / '.git/hooks/pre-commit'
        hook.write_text('#!/bin/sh\ntouch .previous-hook-ran\n')
        hook.chmod(0o700)
        self.assertEqual(0, guard.main(['--install-hooks']))
        self.assertEqual(0, guard.main(['--install-hooks']))
        hooks = Path(self.git('config', '--local', '--get', 'core.hooksPath'))
        self.stage('README.md', 'English')
        self.git('commit', '-qm', 'Initial product')
        self.assertTrue((self.root / '.previous-hook-ran').exists())
        self.assertIn('--staged', (self.root / '.scanner-arguments').read_text())
        r = subprocess.run([str(hooks / 'pre-push'), 'origin', 'unused'], input=b'', capture_output=True)
        self.assertEqual(0, r.returncode)
        tip = self.git('rev-parse', 'HEAD')
        r = subprocess.run([str(hooks / 'pre-push'), 'origin', 'unused'],
                           input=f'refs/heads/main {tip} refs/heads/main {"0" * 40}\n'.encode(), capture_output=True)
        self.assertEqual(0, r.returncode)
        self.assertIn('--log-opts=' + tip, (self.root / '.scanner-arguments').read_text())
        scanner.write_text('#!/bin/sh\nexit 1\n')
        r = subprocess.run([str(hooks / 'pre-commit')], capture_output=True)
        self.assertNotEqual(0, r.returncode)
        scanner.unlink()
        r = subprocess.run([str(hooks / 'pre-commit')], capture_output=True)
        self.assertNotEqual(0, r.returncode)
        scanner.write_text('#!/bin/sh\nexit 0\n')
        scanner.chmod(0o700)
        self.stage('private.log', 'Local')
        r = subprocess.run(['git', 'commit', '-qm', 'Blocked change'], capture_output=True)
        self.assertNotEqual(0, r.returncode)

    def test_unmerged_index_and_submodules(self):
        with patch.object(guard, 'git', return_value=b'100644 abc 1\ta.txt\x00'):
            with self.assertRaises(ValueError):
                list(guard.entries(None))
        with patch.object(guard, 'git', return_value=b'160000 commit abc\tsubmodule\x00'):
            with self.assertRaises(ValueError):
                list(guard.entries('HEAD'))

    def test_ci_configuration_generation_and_overwrite_protection(self):
        target = self.root / 'out/google-services.json'
        ios = self.root / 'ios-config'
        manifest = self.root / 'out/AndroidManifest.xml'
        info = self.root / 'Info.plist'
        info.write_bytes(plistlib.dumps({'CFBundleName': 'Pixora'}))
        ci_info = self.root / 'out/Info.plist'
        feedback = self.root / 'out/feedback.properties'
        self.assertEqual(0, firebase.main(['--android-output', str(target), '--ios-root', str(ios),
                         '--android-manifest-output', str(manifest), '--ios-info-plist', str(info),
                         '--ios-ci-info', str(ci_info), '--feedback-properties-output', str(feedback)]))
        self.assertIn('pixora-ci-placeholder', feedback.read_text())
        self.assertEqual(0, firebase.main(['--feedback-properties-output', str(feedback)]))
        feedback.write_text('endpoint=owner-local-value\n')
        with self.assertRaises(SystemExit):
            firebase.main(['--feedback-properties-output', str(feedback)])
        self.assertEqual('endpoint=owner-local-value\n', feedback.read_text())
        self.assertIn('tools:node="remove"', manifest.read_text())
        self.assertTrue(plistlib.loads(ci_info.read_bytes())['FIREBASE_ANALYTICS_COLLECTION_DEACTIVATED'])
        self.assertEqual('Pixora', plistlib.loads(ci_info.read_bytes())['CFBundleName'])
        data = json.loads(target.read_text())
        self.assertEqual('pixora-ci-placeholder', data['project_info']['project_id'])
        self.assertEqual({'dev.kigya.pixora', 'dev.kigya.pixora.debug'}, {c['client_info']['android_client_info']['package_name'] for c in data['client']})
        for mode in ['Debug', 'Release']:
            config = plistlib.loads((ios / mode / 'GoogleService-Info.plist').read_bytes())
            self.assertFalse(config['IS_ANALYTICS_ENABLED'])
            self.assertFalse(config['IS_GCM_ENABLED'])
            self.assertEqual('dev.kigya.pixora.debug' if mode == 'Debug' else 'dev.kigya.pixora', config['BUNDLE_ID'])
        self.assertEqual(0, firebase.main(['--ios-root', str(ios)]))
        protected = ios / 'Debug/GoogleService-Info.plist'
        protected.write_bytes(plistlib.dumps({'PROJECT_ID': 'owner-local-config'}))
        with self.assertRaises(SystemExit):
            firebase.main(['--ios-root', str(ios)])
        self.assertEqual('owner-local-config', plistlib.loads(protected.read_bytes())['PROJECT_ID'])
        target.write_text('{"project_info":{"project_id":"owner-local-config"}}')
        with self.assertRaises(SystemExit):
            firebase.main(['--android-output', str(target)])
        self.assertEqual('owner-local-config', json.loads(target.read_text())['project_info']['project_id'])
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                firebase.main([])
            with self.assertRaises(SystemExit):
                firebase.main(['--ios-root', str(self.root / 'other-ios'), '--ios-ci-info', str(ci_info)])
            with self.assertRaises(SystemExit):
                firebase.main(['--ios-root', str(self.root / 'another-ios'),
                               '--ios-info-plist', str(info), '--ios-ci-info', str(info)])


if __name__ == '__main__':
    unittest.main()
