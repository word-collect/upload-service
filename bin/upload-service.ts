#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { UploadStack } from '../lib/upload-service-stack'

const app = new cdk.App()

const appName = 'word-collect'
const environment = app.node.tryGetContext('environment') || 'dev'

const uploadStack = new UploadStack(
  app,
  `${appName}-${environment}-upload-stack`,
  {
    appName,
    environment,
    description: 'Frontend stack for frontend service',
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION
    }
  }
)

// Add tags to all stacks
const tags = {
  Environment: environment,
  Service: 'upload-service',
  Application: appName
}

Object.entries(tags).forEach(([key, value]) => {
  cdk.Tags.of(uploadStack).add(key, value)
})
