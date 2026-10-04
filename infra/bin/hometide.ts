#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { HometideAiStack } from '../lib/ai-stack';
import { HometideAuthStack } from '../lib/auth-stack';

const app = new App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'us-west-2' };

// The API itself runs on Railway; these stacks hold the AWS pieces it uses.
new HometideAiStack(app, 'HometideAi', { env, description: 'Hometide: Bedrock access and AgentCore Memory' });
new HometideAuthStack(app, 'HometideAuth', { env, description: 'Hometide: Cognito sign-in (adopt with cdk import)' });
