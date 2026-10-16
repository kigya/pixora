#!/usr/bin/env python3
from pathlib import Path
import os,secrets,subprocess
root=Path(__file__).resolve().parent.parent
props=root/'android/signing.properties';key=root/'android/keystores/upscale-image.jks'
if props.exists() or key.exists():raise SystemExit('Signing material already exists; no files changed')
key.parent.mkdir(parents=True,exist_ok=True)
password=secrets.token_hex(24);env=os.environ.copy();env['UPSCALE_KEY_PASSWORD']=password
subprocess.run(['keytool','-genkeypair','-keystore',str(key),'-storepass:env','UPSCALE_KEY_PASSWORD','-keypass:env','UPSCALE_KEY_PASSWORD','-alias','upscale-image','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Upscale Image Local Release'],check=True,env=env)
props.write_text(f'storeFile=keystores/upscale-image.jks\nstorePassword={password}\nkeyAlias=upscale-image\nkeyPassword={password}\n');props.chmod(0o600);key.chmod(0o600)
print('Local signing key created. Back up android/keystores and signing.properties privately.')
