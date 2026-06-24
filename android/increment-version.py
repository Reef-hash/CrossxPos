#!/usr/bin/env python3
"""
Auto-increment versionCode before building APK.
This prevents "invalid package" errors on reinstallation.
"""

import os
import re

version_file = os.path.join(os.path.dirname(__file__), 'version.properties')

try:
    # Read current version
    with open(version_file, 'r') as f:
        content = f.read()
    
    # Extract versionCode
    match = re.search(r'versionCode=(\d+)', content)
    if match:
        current_code = int(match.group(1))
        new_code = current_code + 1
        
        # Update versionCode
        new_content = re.sub(r'versionCode=\d+', f'versionCode={new_code}', content)
        
        with open(version_file, 'w') as f:
            f.write(new_content)
        
        print(f"✓ Version incremented: {current_code} → {new_code}")
    else:
        print("✗ Could not find versionCode in version.properties")
        
except Exception as e:
    print(f"✗ Error: {e}")
    exit(1)
