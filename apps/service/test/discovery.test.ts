import test from "node:test";
import assert from "node:assert/strict";
import { AwsProvider } from "../src/cloud.js";
import {
  DescribeRegionsCommand,
  DescribeInstanceTypesCommand,
  DescribeSubnetsCommand,
  DescribeSecurityGroupsCommand,
} from "@aws-sdk/client-ec2";
function clients(restricted = false) {
  return {
    sts: { send: async () => ({ Account: "123456789012" }) },
    iam: {
      send: async (command: any) => {
        if (restricted)
          throw new Error("Private provider details must not appear");
        return command.input.Marker
          ? {
              InstanceProfiles: [
                {
                  InstanceProfileName: "second",
                  Arn: "arn:example",
                  Roles: [],
                },
              ],
              IsTruncated: false,
            }
          : {
              InstanceProfiles: [
                {
                  InstanceProfileName: "first",
                  Arn: "arn:example",
                  Roles: [{ RoleName: "worker" }],
                },
              ],
              IsTruncated: true,
              Marker: "next",
            };
      },
    },
    ec2: {
      send: async (command: any) => {
        if (command instanceof DescribeRegionsCommand)
          return { Regions: [{ RegionName: "us-east-1" }] };
        if (command instanceof DescribeInstanceTypesCommand)
          return { InstanceTypes: [] };
        if (command instanceof DescribeSubnetsCommand)
          return command.input.NextToken
            ? { Subnets: [{ SubnetId: "subnet-bb", VpcId: "vpc-aa" }] }
            : {
                Subnets: [{ SubnetId: "subnet-aa", VpcId: "vpc-aa" }],
                NextToken: "next",
              };
        if (command instanceof DescribeSecurityGroupsCommand) {
          if (restricted)
            throw new Error("Private provider details must not appear");
          return {
            SecurityGroups: [
              { GroupId: "sg-aa", GroupName: "worker", VpcId: "vpc-aa" },
            ],
          };
        }
        if (restricted)
          throw new Error("Private provider details must not appear");
        return {
          VpcEndpoints: [
            {
              VpcEndpointId: "vpce-aa",
              VpcId: "vpc-aa",
              ServiceName: "com.amazonaws.us-east-1.ssmmessages",
              State: "available",
              PrivateDnsEnabled: true,
            },
          ],
        };
      },
    },
  };
}
test("discovery reads existing paginated resources and never upgrades listings into connectivity proof", async () => {
  const value: any = await new AwsProvider().discovery(
    "us-east-1",
    clients() as any,
  );
  assert.equal(value.subnets.length, 2);
  assert.equal(value.instanceProfiles.length, 2);
  assert.equal(value.securityGroups.length, 1);
  assert.equal(value.network.automaticSetup, false);
  assert.equal(value.network.verified, false);
  assert.equal(value.network.endpoints[0].networkVerified, false);
  assert.equal(value.instanceProfiles[0].permissionsVerified, false);
  assert.equal(value.discoveryState.instanceProfiles.available, true);
  assert.equal(value.network.setupRequired, false);
});
test("missing IAM or network read permissions remain explicit without losing existing subnets", async () => {
  const value: any = await new AwsProvider().discovery(
    "us-east-1",
    clients(true) as any,
  );
  assert.equal(value.subnets.length, 2);
  assert.equal(value.instanceProfiles.length, 0);
  assert.equal(value.discoveryState.instanceProfiles.available, false);
  assert.equal(value.discoveryState.securityGroups.available, false);
  assert.equal(value.network.endpointsAvailable, false);
  assert.equal(value.network.setupRequired, true);
  assert.equal(
    JSON.stringify(value).includes("Private provider details"),
    false,
  );
});
