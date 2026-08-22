#!/bin/bash
source ~/.gll-dashboard.env
curl -s -H "Authorization: Bearer ${CRON_SECRET}" https://gll-dashboard.vercel.app/api/sync >> /Users/sumeetharish/gll-dashboard/logs/sync.log 2>&1
echo "" >> /Users/sumeetharish/gll-dashboard/logs/sync.log
