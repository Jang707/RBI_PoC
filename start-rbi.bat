@echo off
echo RBI Server and Client Launcher
echo ============================
echo.

:menu
echo Choose an option:
echo 1. Start RBI Server
echo 2. Start Web Client
echo 3. Start Automation Script
echo 4. Start Both Server and Web Client
echo 5. Exit
echo.

set /p choice=Enter your choice (1-5): 

if "%choice%"=="1" goto start_server
if "%choice%"=="2" goto start_web_client
if "%choice%"=="3" goto start_automation
if "%choice%"=="4" goto start_both
if "%choice%"=="5" goto end

echo Invalid choice. Please try again.
echo.
goto menu

:start_server
echo.
echo Starting RBI Server...
start cmd /k "cd /d c:\Users\unet-ai\AI\rbi_test\rbi-cuda-solution\server && npm start"
echo RBI Server started in a new window.
echo.
goto menu

:start_web_client
echo.
echo Starting Web Client...
start cmd /k "cd /d c:\Users\unet-ai\AI\rbi_test && npm run web"
echo Web Client started in a new window.
echo.
goto menu

:start_automation
echo.
echo Starting Automation Script...
echo.
echo Available options:
echo --server-url ^<url^>     RBI Server URL (default: http://localhost:3000)
echo --start-url ^<url^>      Initial URL to navigate to (default: https://example.com)
echo --width ^<width^>        Viewport width (default: 1280)
echo --height ^<height^>      Viewport height (default: 720)
echo --quality ^<quality^>    Stream quality (low, medium, high, ultra) (default: high)
echo --frame-rate ^<rate^>    Frame rate (default: 30)
echo --navigate ^<url^>       Navigate to URL after session creation
echo --auto-stop ^<seconds^>  Automatically stop the session after specified seconds
echo.
set /p options=Enter options (or press Enter for defaults): 
start cmd /k "cd /d c:\Users\unet-ai\AI\rbi_test && node rbi-automation.js %options%"
echo Automation Script started in a new window.
echo.
goto menu

:start_both
echo.
echo Starting RBI Server and Web Client...
start cmd /k "cd /d c:\Users\unet-ai\AI\rbi_test\rbi-cuda-solution\server && npm start"
timeout /t 5 /nobreak > nul
start cmd /k "cd /d c:\Users\unet-ai\AI\rbi_test && npm run web"
echo RBI Server and Web Client started in new windows.
echo.
goto menu

:end
echo.
echo Exiting...
exit
