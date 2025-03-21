#!/bin/bash

# Script to build all domain packages

# Store the current directory
ORIGINAL_DIR=$(pwd)

# Define the domains to build
DOMAINS=("developer" "student" "project" "qualitativeresearch" "quantitativeresearch")

# Print header
echo "====================================="
echo "Building all domain packages"
echo "====================================="

# Loop through each domain and build
for domain in "${DOMAINS[@]}"; do
  echo ""
  echo "Building $domain..."
  
  # Check if domain directory exists
  if [ -d "$domain" ]; then
    # Navigate to the domain directory
    cd "$domain"
    
    # Run npm build
    npm run build
    
    # Capture the exit status
    BUILD_STATUS=$?
    
    # Check if build was successful
    if [ $BUILD_STATUS -eq 0 ]; then
      echo "✅ $domain built successfully"
    else
      echo "❌ $domain build failed with status $BUILD_STATUS"
    fi
    
    # Return to the original directory
    cd "$ORIGINAL_DIR"
  else
    echo "❌ $domain directory not found"
  fi
done

echo ""
echo "====================================="
echo "Build process completed"
echo "=====================================" 