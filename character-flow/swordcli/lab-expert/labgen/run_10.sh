#!/bin/bash
for i in {1..10}
do
    echo "Running iteration $i..."
    python3 main.py generate "Test Experiment about triac and diac together" "Complex Resistor Circuit and its diagrams" --exp $i
    echo "Iteration $i complete."
done
