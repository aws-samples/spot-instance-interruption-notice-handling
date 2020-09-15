import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as lambda from '@aws-cdk/aws-lambda';
import * as events from '@aws-cdk/aws-events';
import * as eventstargets from '@aws-cdk/aws-events-targets';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';


export class SpotInstanceInterruptionNoticeHandlingStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const accessLogBucket = new s3.Bucket(this, 'AccessLogBucket');

    const vpc = new ec2.Vpc(this, 'Vpc', {
      cidr: '10.0.0.0/16',
      maxAzs: 2,
      subnetConfiguration: [
          {
              subnetType: ec2.SubnetType.PRIVATE,
              name: 'Private',
              cidrMask: 24
          },
          {
              subnetType: ec2.SubnetType.PUBLIC,
              name: 'Public',
              cidrMask: 24
          }
      ]
    });

    const myIp = this.node.tryGetContext('myIp');
    const albSecurityGroup = new ec2.SecurityGroup(this, 'ALBSecurityGroup', {
      vpc: vpc
    });
    albSecurityGroup.addIngressRule(ec2.Peer.ipv4(myIp), ec2.Port.tcp(80));
    const alb = new elbv2.CfnLoadBalancer(this, 'ALB', {
      subnets: vpc.selectSubnets({
        subnetType: ec2.SubnetType.PUBLIC
      }).subnetIds,
       securityGroups: [albSecurityGroup.securityGroupId]
    });
    const targetGroup = new elbv2.CfnTargetGroup(this, 'TargetGroup', {
      vpcId: vpc.vpcId,
      protocol: 'HTTP',
      port: 80
    });
    const httpListener = new elbv2.CfnListener(this, 'HttpListener', {
      loadBalancerArn: alb.ref,
      protocol: 'HTTP',
      port: 80,
      defaultActions: [{
        type: 'forward',
        targetGroupArn: targetGroup.ref
      }]
    });

    const ec2SecurityGroup = new ec2.SecurityGroup(this, 'EC2SecurityGroup', {
      vpc: vpc
    });
    ec2SecurityGroup.addIngressRule(ec2.Peer.ipv4(myIp), ec2.Port.tcp(80));
    ec2SecurityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(80));
    ec2SecurityGroup.addIngressRule(ec2.Peer.ipv4(myIp), ec2.Port.tcp(22));

    const userData = ec2.UserData.forLinux();
    userData.addCommands('sudo yum install -y httpd');
    userData.addCommands('sudo systemctl enable httpd');
    userData.addCommands('sudo systemctl start httpd');
    userData.addCommands('sudo echo "<html><body>hello</body></html>" > /var/www/html/index.html');
    userData.addCommands('sudo chmod 644 /var/www/html/index.html');
    userData.addCommands('sudo cat << \'EOF\' > /root/check-spot-instance-interruption.sh');
    userData.addCommands('#!/bin/sh');
    userData.addCommands('TOKEN=`curl -X PUT -s "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600"`');
    userData.addCommands('INSTANCE_ACTION_STATUS_CODE=`curl -H "X-aws-ec2-metadata-token: $TOKEN" -LI http://169.254.169.254/latest/meta-data/spot/instance-action -o /dev/null -w \'%{http_code}\' -s`');
    userData.addCommands('DATE=`date`');
    userData.addCommands('if [ $INSTANCE_ACTION_STATUS_CODE = \'200\' ]; then');
    userData.addCommands('    echo "$DATE: interrupted!"');
    userData.addCommands('    INSTANCE_ID=`curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id`');
    userData.addCommands('    sudo aws s3 cp /var/log/httpd/access_log s3://' + accessLogBucket.bucketName + '/accesslog/$INSTANCE_ID');
    userData.addCommands('else');
    userData.addCommands('    echo "$DATE: no interruption"');
    userData.addCommands('fi');
    userData.addCommands('EOF');
    userData.addCommands('chmod 755 /root/check-spot-instance-interruption.sh');
    userData.addCommands('crontab << \'EOF\'');
    userData.addCommands('* * * * * for i in `seq 0 5 59`;do (sleep ${i}; /root/check-spot-instance-interruption.sh >> /var/log/check-spot-instance-interruption.log 2>&1) & done;'); // every 5 seconds
    userData.addCommands('EOF');

    const ec2Role = new iam.Role(this, 'EC2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    });
    accessLogBucket.grantWrite(ec2Role);
    const ec2InstanceProfile = new iam.CfnInstanceProfile(this, 'EC2InstanceProfile', {
      roles: [ec2Role.roleName]
    });

    const launchTemplate = new ec2.CfnLaunchTemplate(this, 'LaunchTemplate', {
      launchTemplateData: {
        imageId: new ec2.AmazonLinuxImage().getImage(this).imageId,
        keyName: this.node.tryGetContext('ec2KeyName'),
        instanceType: this.node.tryGetContext('ec2InstanceType') || 't2.micro',
        securityGroupIds: [ec2SecurityGroup.securityGroupId],
        iamInstanceProfile: {
          arn: ec2InstanceProfile.attrArn
        },
        ebsOptimized: false,
        blockDeviceMappings: [
          {
            deviceName: '/dev/xvda',
            ebs: {
              deleteOnTermination: false
            }
          }
        ],
        userData: cdk.Fn.base64(userData.render())
      }
    });

    const cfnAutoScalingGroup = new autoscaling.CfnAutoScalingGroup(this, 'AutoScalingGroup', {
      maxSize: '5',
      minSize: '0',
      desiredCapacity: '1',
      mixedInstancesPolicy: {
        instancesDistribution: {
          onDemandBaseCapacity: 0,
          onDemandPercentageAboveBaseCapacity: 0
        },
        launchTemplate: {
          launchTemplateSpecification: {
            launchTemplateId: launchTemplate.ref,
            version: launchTemplate.attrLatestVersionNumber
          },
          overrides: [
            {
              instanceType: 't2.micro'
            }
          ]
        }
      },
      terminationPolicies: ['OldestLaunchTemplate'],
      vpcZoneIdentifier: vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE
      }).subnetIds,
      targetGroupArns: [targetGroup.ref]
    });

    const deregisterFunction = new lambda.Function(this, 'DeregisterFunction', {
      runtime: lambda.Runtime.PYTHON_3_8,
      handler: 'deregister.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        TARGET_GROUP_ARN: targetGroup.ref
      }
    });
    deregisterFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['elasticloadbalancing:DeregisterTargets'],
      resources: [targetGroup.ref]
    }));

    const rule = new events.Rule(this, 'Rule', {
      eventPattern: {
        source: ['aws.ec2'],
        detailType: ['EC2 Spot Instance Interruption Warning']
      },
      targets: [new eventstargets.LambdaFunction(deregisterFunction)]
    });
  }
}
