#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { SpotInstanceInterruptionNoticeHandlingStack } from '../lib/spot-instance-interruption-notice-handling-stack';

const app = new cdk.App();
new SpotInstanceInterruptionNoticeHandlingStack(app, 'SpotInstanceInterruptionNoticeHandlingStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
    }
});
