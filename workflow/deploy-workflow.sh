#!/bin/bash

echo "Deploying workflow to CRE Network..."
cre workflow deploy ./workflow/risk-evaluator.ts \
  --config ./workflow/config.json \
  --cre-config ./cre.json

