#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { UploadStack } from '../lib/upload-service-stack'

const app = new cdk.App()
new UploadStack(app, 'UploadStack')
