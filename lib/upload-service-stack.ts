// lib/upload-stack.ts
import { Stack, StackProps, Duration, Fn } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as integ from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as events from 'aws-cdk-lib/aws-events'
import * as targets from 'aws-cdk-lib/aws-events-targets'
import * as apigwAuth from 'aws-cdk-lib/aws-apigatewayv2-authorizers'

export interface UploadStackProps extends StackProps {
  appName: string
  environment: string
}

export class UploadStack extends Stack {
  constructor(scope: Construct, id: string, props: UploadStackProps) {
    super(scope, id, props)

    const { appName, environment } = props

    // 1. Bucket
    const bucket = new s3.Bucket(this, 'Uploads', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: [
            'https://wordcollect.haydenturek.com',
            'http://localhost:3000'
          ], // tighten later
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

    // 3. Tiny HTTP API  ➜  SECURED BY COGNITO JWT  ───────────────────────

    // (a) look up the Cognito pool + client that your user-service stack created
    const poolId = ssm.StringParameter.valueForStringParameter(
      this,
      `/${appName}/${environment}/user-service/userPoolId`
    )
    const clientId = ssm.StringParameter.valueForStringParameter(
      this,
      `/${appName}/${environment}/user-service/appClientId`
    )

    const api = new apigwv2.HttpApi(this, 'Api', {
      corsPreflight: {
        allowOrigins: [
          'https://wordcollect.haydenturek.com',
          'http://localhost:3000'
        ],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.OPTIONS
        ],
        allowHeaders: ['authorization', 'content-type'],
        allowCredentials: true
      }
    })

    const authorizer = new apigwAuth.HttpJwtAuthorizer(
      'JwtAuth',
      `https://cognito-idp.${this.region}.amazonaws.com/${poolId}`,
      { jwtAudience: [clientId] }
    )

    // (c) wire the route through that authoriser
    api.addRoutes({
      path: '/upload-url',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integ.HttpLambdaIntegration(
        'RequestUrlIntegration',
        requestUrlFn
      ),
      authorizer
    })

    // 4. Publish the endpoint so other stacks can read it
    new ssm.StringParameter(this, 'UploadApiParam', {
      parameterName: `/${appName}/${environment}/upload-service/api-endpoint`,
      stringValue: api.apiEndpoint
    })

    new ssm.StringParameter(this, 'BucketARNParam', {
      parameterName: `/${appName}/${environment}/upload-service/bucket-arn`,
      stringValue: bucket.bucketArn
    })

    // 1️⃣  Let S3 fire events onto the **default** EventBridge bus
    bucket.enableEventBridgeNotification()

    const eventBus = events.EventBus.fromEventBusName(
      this,
      'SharedEventBus',
      Fn.importValue(`${appName}-${environment}-event-bus-name`)
    )

    // 3️⃣  Forward only *our* upload events (prefix "raw/") to the custom bus
    new events.Rule(this, 'ForwardUploadsRule', {
      eventBus: events.EventBus.fromEventBusName(this, 'DefaultBus', 'default'),
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: { name: [bucket.bucketName] },
          object: { key: [{ prefix: 'raw/' }] }
        }
      },
      targets: [new targets.EventBus(eventBus)]
    })
  }
}
