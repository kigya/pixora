#!/usr/bin/env python3
"""Generate native endpoint data from private build properties; never print the URL."""
from pathlib import Path
import sys
source = Path(sys.argv[1])
target = Path(sys.argv[2])
value = ''
if source.exists():
    for line in source.read_text().splitlines():
        if line.startswith('endpoint='):
            value = line.split('=', 1)[1].strip()
mask = 167
encoded = [byte ^ mask for byte in value.encode('utf-8')]
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text('#pragma once\n#include <array>\nstatic constexpr unsigned char endpointMask = 167;\nstatic constexpr std::array<unsigned char, ' + str(len(encoded)) + '> endpointData = {' + ','.join(map(str, encoded)) + '};\n')
