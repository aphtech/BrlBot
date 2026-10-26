# Run this in an Administrator PowerShell window.
# Adds WMIC back to Windows so "mkc -d" can find the micro:bit drive.
DISM /Online /Add-Capability /CapabilityName:WMIC~~~~
