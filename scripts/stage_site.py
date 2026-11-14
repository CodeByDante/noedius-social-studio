#!/usr/bin/env python3
"""Whitelist public web assets. Do not ship scripts, git metadata, tests or secrets."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
dest = root / '_site'
if dest.exists():
    shutil.rmtree(dest)
dest.mkdir()
for name in ('index.html', 'channels.json', 'app-config.json'):
    path = root / name
    if path.is_file():
        shutil.copy2(path, dest / name)
for pattern in ('*.css', '*.js', '*.svg', '*.ico', '*.webmanifest'):
    for path in root.glob(pattern):
        if path.is_file():
            shutil.copy2(path, dest / path.name)
for name in ('assets', 'data'):
    path = root / name
    if path.is_dir():
        shutil.copytree(path, dest / name, ignore=shutil.ignore_patterns('*.tmp', '__pycache__', '.*'))
(dest / '.nojekyll').touch()
if not (dest / 'index.html').is_file():
    raise SystemExit('Falta index.html; no se publicará un sitio vacío.')
print('Artefacto público preparado en _site/')
