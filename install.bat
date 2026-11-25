@echo off
rem Windows: double-click to register the helper. Needs Python 3 from python.org.
where py >nul 2>nul
if %errorlevel%==0 (py -3 "%~dp0install.py" %*) else (python "%~dp0install.py" %*)
pause
