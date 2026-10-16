#!/usr/bin/env python3
"""Build pinned Ruby only inside this Personal worktree when CI/local Ruby is absent.
Sources: ruby-lang.org release checksums and yaml/libyaml 0.2.5 (Homebrew hash).
"""
from pathlib import Path
import hashlib, os, shutil, subprocess, tarfile
ROOT=Path(__file__).resolve().parent.parent
LOCAL=ROOT/'.p-build-app/local'
SOURCE=LOCAL/'ruby-source'
PREFIX=LOCAL/'ruby-3.3.12'
SUPPORT=LOCAL/'ruby-support'
SOURCES={
 'ruby-3.3.12':('https://cache.ruby-lang.org/pub/ruby/3.3/ruby-3.3.12.tar.gz','b06d63beae271933033e27f0a389bc582a009e7845357d44365c39de525a051b'),
 'libyaml-0.2.5':('https://github.com/yaml/libyaml/archive/refs/tags/0.2.5.tar.gz','fa240dbf262be053f3898006d502d514936c818e422afdcf33921c63bed9bf2e'),
}
SOURCE.mkdir(parents=True,exist_ok=True)
for name,(url,expected) in SOURCES.items():
 archive=SOURCE/(name+'.tar.gz')
 if not archive.exists():subprocess.run(['curl','-fLsS','--retry','2',url,'-o',str(archive)],check=True)
 if hashlib.sha256(archive.read_bytes()).hexdigest()!=expected:raise SystemExit('Ruby dependency checksum mismatch: '+name)
 if not (SOURCE/name).exists():
  with tarfile.open(archive) as contents:contents.extractall(SOURCE,filter='data')
cmake=shutil.which('cmake')
if not cmake:
 sdk=Path(os.environ.get('ANDROID_HOME',os.environ.get('ANDROID_SDK_ROOT',str(Path.home()/'Library/Android/sdk'))))
 installed=sorted((sdk/'cmake').glob('*/bin/cmake'))
 if installed:cmake=str(installed[-1])
if not cmake:raise SystemExit('CMake is required to build local Ruby; or provide Ruby 3.3.12 on PATH')
env=dict(os.environ,DEVELOPER_DIR=os.environ.get('DEVELOPER_DIR','/Applications/Xcode.app/Contents/Developer'))
subprocess.run([cmake,'-S',str(SOURCE/'libyaml-0.2.5'),'-B',str(SOURCE/'libyaml-build'),'-DBUILD_TESTING=OFF','-DBUILD_SHARED_LIBS=OFF','-DCMAKE_INSTALL_PREFIX='+str(SUPPORT)],env=env,check=True)
subprocess.run([cmake,'--build',str(SOURCE/'libyaml-build'),'--target','install','--parallel','4'],env=env,check=True)
build=SOURCE/'ruby-build';build.mkdir(exist_ok=True)
openssl=Path(os.environ.get('PIXORA_OPENSSL_DIR','/opt/homebrew/opt/openssl@3'))
if not (openssl/'include/openssl/ssl.h').exists():raise SystemExit('OpenSSL 3 development headers required; set PIXORA_OPENSSL_DIR or provide Ruby 3.3.12')
subprocess.run([str(SOURCE/'ruby-3.3.12/configure'),'--prefix='+str(PREFIX),'--disable-install-doc','--disable-yjit','--without-gmp','--without-readline','--with-openssl-dir='+str(openssl),'--with-libyaml-dir='+str(SUPPORT)],cwd=build,env=env,check=True)
subprocess.run(['make','-j4'],cwd=build,env=env,check=True)
subprocess.run(['make','install'],cwd=build,env=env,check=True)
subprocess.run([str(PREFIX/'bin/ruby'),'-rpsych','-ropenssl','-rjson','-e','abort unless RUBY_VERSION == "3.3.12"; puts "Local Ruby 3.3.12: YAML/OpenSSL/JSON ready"'],env=env,check=True)

(PREFIX/'.pixora-ready').write_text('3.3.12\n')
