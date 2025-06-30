// lib/upload-stack.ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs'
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2'
import * as integ from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as ssm from 'aws-cdk-lib/aws-ssm'

export interface UploadStackProps extends StackProps {
  appName: string
  environment: string
}

export class UploadStack extends Stack {
  constructor(scope: Construct, id: string, props: UploadStackProps) {
    super(scope, id, props)

    // 1. Bucket
    const bucket = new s3.Bucket(this, 'Uploads', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: ['https://wordcollect.haydenturek.com'], // tighten later
          allowedHeaders: ['*'],
          maxAge: 3600
        }
      ]
    })

    // 2. Lambda that emits a pre-signed PUT URL
    const requestUrlFn = new lambda.NodejsFunction(this, 'RequestUrlFn', {
      entry: 'src/get-upload-url.ts',
      timeout: Duration.seconds(10),
      environment: {
        BUCKET_NAME: bucket.bucketName,
        URL_EXPIRY: '900' // 15 min
      }
    })
    bucket.grantPut(requestUrlFn)

    // 3. Tiny HTTP API
    const api = new apigw.HttpApi(this, 'UploadApi')
    api.addRoutes({
      path: '/upload-url',
      methods: [apigw.HttpMethod.GET],
      integration: new integ.HttpLambdaIntegration(
        'RequestUrlIntegration',
        requestUrlFn
      )
    })

    // 4. Publish the endpoint so other stacks can read it
    new ssm.StringParameter(this, 'UploadApiParam', {
      parameterName: '/wordcollect/upload-service/apiEndpoint',
      stringValue: api.apiEndpoint
    })
  }
}
