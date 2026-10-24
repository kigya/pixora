#!/usr/bin/env python3
"""Run the same strict owned-source gates used by CI across every production layer."""
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
commands = [
    [sys.executable, 'scripts/check-js-coverage.py'],
    [sys.executable, 'scripts/check-native-coverage.py',
     '--kotlin', 'android/app/build/reports/jacoco/nativeJvmCoverage/nativeJvmCoverage.xml',
     '--kotlin-source-dir', 'android/app/src/main/java'],
    [sys.executable, 'scripts/check-native-coverage.py',
     '--llvm', 'coverage/native-core/coverage.json',
     '--llvm', 'coverage/recommendation/coverage.json',
     '--llvm', 'coverage/recommendation-jni/coverage.json',
     '--llvm', 'coverage/ios/coverage.json',
     '--source-dir', 'native/engine', '--source-dir', 'native/recommendation',
     '--source-dir', 'ios/Native', '--source-dir', 'ios/Pixora',
     '--require-source', 'native/recreate/recreate.cpp',
     '--require-source', 'android/app/src/main/cpp/engine/recreate_jni.cpp',
     '--require-source', 'android/app/src/main/cpp/engine/upscale.cpp',
     '--require-source', 'android/app/src/main/cpp/engine/raster_jni.cpp',
     '--require-source', 'android/app/src/main/cpp/engine/recommendation_jni.cpp'],
]
failed = False
for command in commands:
    failed = subprocess.run(command, cwd=root, check=False).returncode != 0 or failed
sys.exit(1 if failed else 0)
