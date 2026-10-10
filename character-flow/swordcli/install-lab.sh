#!/bin/bash
# Install LAB_Expert requirements
cd lab-expert
pip install -r labgen/requirements.txt
cd frontend
npm install
npm run build
cd ..
echo "LAB_Expert installation complete!"
