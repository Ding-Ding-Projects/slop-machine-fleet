import test from "node:test";
import assert from "node:assert/strict";
import { AwsProvider } from "../src/cloud.js";
import {
  DescribeImagesCommand,
  RunInstancesCommand,
} from "@aws-sdk/client-ec2";
import { GetParameterCommand } from "@aws-sdk/client-ssm";
const spec = {
  count: 1,
  region: "ca-central-1",
  instanceType: "m7i.large",
  subnetId: "subnet-aa",
  securityGroupId: "sg-aa",
  instanceProfile: "worker",
  bootGiB: 80,
  dataGiB: 100,
};
test("launch returns the exact Amazon-filtered image and root-device values used by its request", async () => {
  const requests: any[] = [],
    resolvedAt = "2026-11-03T12:34:56.000Z";
  const ec2: any = {
      send: async (command: any) => {
        requests.push(command);
        if (command instanceof DescribeImagesCommand)
          return {
            Images: [
              {
                ImageId: "ami-resolved-test",
                RootDeviceName: "/dev/test-root",
                OwnerId: "test-provider-owner",
              },
            ],
          };
        if (command instanceof RunInstancesCommand)
          return { Instances: [{ InstanceId: "i-launched-test" }] };
        throw new Error("Unexpected test command");
      },
    },
    ssm: any = {
      send: async (command: any) => {
        assert.ok(command instanceof GetParameterCommand);
        assert.equal(
          command.input.Name,
          "/aws/service/ami-windows-latest/Windows_Server-2025-English-Full-Base",
        );
        return { Parameter: { Value: "ami-parameter-test", Version: 42 } };
      },
    };
  const result = await new AwsProvider().launch(
    spec,
    "test-idempotency",
    ["worker-test"],
    { ec2, ssm, now: () => new Date(resolvedAt) },
  );
  assert.deepEqual(requests[0].input, {
    ImageIds: ["ami-parameter-test"],
    Owners: ["amazon"],
  });
  const used = requests[1].input;
  assert.equal(result[0].instanceId, "i-launched-test");
  assert.deepEqual(result[0].imageProvenance, {
    imageId: used.ImageId,
    rootDeviceName: used.BlockDeviceMappings[0].DeviceName,
    parameterName:
      "/aws/service/ami-windows-latest/Windows_Server-2025-English-Full-Base",
    source: "aws:ssm-public-parameter",
    region: spec.region,
    resolvedAt,
    parameterVersion: 42,
    ownerId: "test-provider-owner",
  });
  assert.equal(used.ClientToken, "test-idempotency-0");
  assert.equal(used.BlockDeviceMappings[0].Ebs.Encrypted, true);
  assert.equal(used.BlockDeviceMappings[1].Ebs.Encrypted, true);
  assert.equal(used.BlockDeviceMappings[1].Ebs.DeleteOnTermination, false);
  assert.equal(used.MetadataOptions.HttpTokens, "required");
});
test("missing official image metadata prevents a launch instead of manufacturing provenance", async () => {
  for (const image of [
    { RootDeviceName: "/dev/test-root" },
    { ImageId: "ami-test" },
  ]) {
    let launched = false;
    await assert.rejects(
      new AwsProvider().launch(spec, "test-idempotency", ["worker-test"], {
        ec2: {
          send: async (command: any) => {
            if (command instanceof RunInstancesCommand) {
              launched = true;
              return {};
            }
            return { Images: [image] };
          },
        } as any,
        ssm: {
          send: async () => ({ Parameter: { Value: "ami-test" } }),
        } as any,
      }),
      /metadata unavailable/,
    );
    assert.equal(launched, false);
  }
});
