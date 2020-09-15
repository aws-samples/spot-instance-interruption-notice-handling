import json
import os
import boto3

elbv2 = boto3.client('elbv2')

def handler(event, context):
    print('event: {}'.format(json.dumps(event)))

    source = event['source']
    instanceId = event['detail']['instance-id']
    print('source: {}, instanceId: {}'.format(source, instanceId))

    targetGroupArn = os.environ['TARGET_GROUP_ARN']

    response = elbv2.deregister_targets(
        TargetGroupArn=targetGroupArn,
        Targets=[
            {
                'Id': instanceId
            }
        ]
    )
    print('response: {}'.format(json.dumps(response)))

    return 'OK'
