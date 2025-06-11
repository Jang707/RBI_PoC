#!/bin/bash

echo "RBI Server and Client Launcher"
echo "============================"
echo ""

function show_menu {
    echo "Choose an option:"
    echo "1. Start RBI Server"
    echo "2. Start Web Client"
    echo "3. Start Automation Script"
    echo "4. Start Both Server and Web Client"
    echo "5. Exit"
    echo ""
}

function start_server {
    echo ""
    echo "Starting RBI Server..."
    gnome-terminal -- bash -c "cd $(pwd)/rbi-cuda-solution/server && npm start; exec bash" 2>/dev/null || \
    xterm -e "cd $(pwd)/rbi-cuda-solution/server && npm start; exec bash" 2>/dev/null || \
    konsole -e "cd $(pwd)/rbi-cuda-solution/server && npm start; exec bash" 2>/dev/null || \
    terminal -e "cd $(pwd)/rbi-cuda-solution/server && npm start; exec bash" 2>/dev/null || \
    open -a Terminal.app "$(pwd)/rbi-cuda-solution/server" 2>/dev/null || \
    (cd $(pwd)/rbi-cuda-solution/server && npm start)
    echo "RBI Server started in a new window (or current window if terminal launch failed)."
    echo ""
}

function start_web_client {
    echo ""
    echo "Starting Web Client..."
    gnome-terminal -- bash -c "cd $(pwd) && npm run web; exec bash" 2>/dev/null || \
    xterm -e "cd $(pwd) && npm run web; exec bash" 2>/dev/null || \
    konsole -e "cd $(pwd) && npm run web; exec bash" 2>/dev/null || \
    terminal -e "cd $(pwd) && npm run web; exec bash" 2>/dev/null || \
    open -a Terminal.app "$(pwd)" 2>/dev/null || \
    (cd $(pwd) && npm run web)
    echo "Web Client started in a new window (or current window if terminal launch failed)."
    echo ""
}

function start_automation {
    echo ""
    echo "Starting Automation Script..."
    echo ""
    echo "Available options:"
    echo "--server-url <url>     RBI Server URL (default: http://localhost:3000)"
    echo "--start-url <url>      Initial URL to navigate to (default: https://example.com)"
    echo "--width <width>        Viewport width (default: 1280)"
    echo "--height <height>      Viewport height (default: 720)"
    echo "--quality <quality>    Stream quality (low, medium, high, ultra) (default: high)"
    echo "--frame-rate <rate>    Frame rate (default: 30)"
    echo "--navigate <url>       Navigate to URL after session creation"
    echo "--auto-stop <seconds>  Automatically stop the session after specified seconds"
    echo ""
    read -p "Enter options (or press Enter for defaults): " options
    
    gnome-terminal -- bash -c "cd $(pwd) && node rbi-automation.js $options; exec bash" 2>/dev/null || \
    xterm -e "cd $(pwd) && node rbi-automation.js $options; exec bash" 2>/dev/null || \
    konsole -e "cd $(pwd) && node rbi-automation.js $options; exec bash" 2>/dev/null || \
    terminal -e "cd $(pwd) && node rbi-automation.js $options; exec bash" 2>/dev/null || \
    open -a Terminal.app "$(pwd)" 2>/dev/null || \
    (cd $(pwd) && node rbi-automation.js $options)
    echo "Automation Script started in a new window (or current window if terminal launch failed)."
    echo ""
}

function start_both {
    echo ""
    echo "Starting RBI Server and Web Client..."
    start_server
    sleep 5
    start_web_client
    echo "RBI Server and Web Client started in new windows."
    echo ""
}

while true; do
    show_menu
    read -p "Enter your choice (1-5): " choice
    
    case $choice in
        1) start_server ;;
        2) start_web_client ;;
        3) start_automation ;;
        4) start_both ;;
        5) echo ""; echo "Exiting..."; exit 0 ;;
        *) echo "Invalid choice. Please try again."; echo "" ;;
    esac
done
