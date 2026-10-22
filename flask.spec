# flask.spec
# Builds the Agent-D Flask backend as a headless executable.
# Output is packaged into dist/flask/ which electron-builder includes as extraResources.

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

crypto_datas = collect_data_files('cryptography')
crypto_hidden = collect_submodules('cryptography')
docx_datas = collect_data_files('docx')
docx_hidden = collect_submodules('docx')
pypdf_datas = collect_data_files('pypdf')
pypdf_hidden = collect_submodules('pypdf')
openpyxl_datas = collect_data_files('openpyxl')
openpyxl_hidden = collect_submodules('openpyxl')

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('static', 'static'),
        ('version.json', '.'),
    ] + crypto_datas + docx_datas + pypdf_datas + openpyxl_datas,
    hiddenimports=[
        'plyer.platforms.win.notification',
        'sqlite3',
        'config_db',
        'context_db',
        'crypto_utils',
        'clinical_context',
        'clinical_chat',
        'clinical_tools',
        'routes',
        'db',
        'ai_db',
        'requests',
        'data_engine',
        'notifier',
        'tools',
        'llm',
        'llm.gateway',
    ] + crypto_hidden + docx_hidden + pypdf_hidden + openpyxl_hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='flask',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,    # Headless background service (no console window)
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='flask',     # Output folder: dist/flask/
)
