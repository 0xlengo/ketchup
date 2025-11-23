#!/bin/bash

echo "Running CRE Workflow Simulation..."
cre workflow simulate ./workflow/risk-evaluator.ts \
  --config ./workflow/config.json \
  --cre-config ./cre.json

