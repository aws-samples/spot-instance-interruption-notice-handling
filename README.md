## Spot Instance Interruption Notice Handling

This is a cdk code creating ALB, Auto Scaling Group with Spot Instances, CloudWatch Events, and Lambda Functions.

When spot instance is interrupted, the system will do the following.
- CloudWatch Events and Lambda Function deregisters the instance from target group of ALB
- Cron and Shell Script upload its Apache access log to S3

## Programming Language
- CDK:                   TypeScript
- Lambda Function:       Python3

## Useful commands

 * `npm install`     install dependent libraries
 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template

## Contextual Parameters
Almost cdk commands needs the following contextual parameters.
 * ec2KeyName        Key pair name for EC2 instances
 * ec2InstanceType   Instance Type for EC2 instances (Optional, Default: t2.micro)
 * myIp              IP address CIDR for Ingress Rule at ALB Security Group. Only client in CIDR can access the ALB.

You can pass the above parameters like this.
```
cdk deploy -c ec2KeyName=key-pair-name -c myIp=x.x.x.x/32
```

## FAQ
### Why do you use L1 Library for ALB, Auto Scaling Group, and Launch Template?
Off course, L2 Library is desirable. However, L2 Library for Auto Scaling Group doesn't support Launch Template. For using Spot instance in Auto Scaling Group, it needs Launch Template.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.

