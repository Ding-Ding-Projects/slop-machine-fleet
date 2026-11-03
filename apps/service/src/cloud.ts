import {
  EC2Client,
  type DescribeSecurityGroupsCommandOutput,
  type DescribeVpcEndpointsCommandOutput,
  DescribeRegionsCommand,
  DescribeSubnetsCommand,
  DescribeInstanceTypesCommand,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  RebootInstancesCommand,
  TerminateInstancesCommand,
  DescribeInstancesCommand,
  DescribeImagesCommand,
  DescribeSecurityGroupsCommand,
  DescribeVpcEndpointsCommand,
} from "@aws-sdk/client-ec2";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { IAMClient, ListInstanceProfilesCommand } from "@aws-sdk/client-iam";
import { PricingClient, GetProductsCommand } from "@aws-sdk/client-pricing";
import type {
  LaunchSpec,
  CostEstimate,
  WorkerAction,
  Worker,
} from "@fleet/shared";
export interface CloudProvider {
  identity(region: string): Promise<string>;
  observe(worker: Worker): Promise<string>;
  dataVolume(worker: Worker): Promise<string>;
  discovery(region: string): Promise<unknown>;
  estimate(spec: LaunchSpec): Promise<CostEstimate>;
  launch(spec: LaunchSpec, key: string, ids: string[]): Promise<string[]>;
  action(worker: any, action: WorkerAction): Promise<void>;
}
function prices(items: string[] | undefined, unit: string): number[] {
  return (items ?? [])
    .flatMap((raw) => {
      const p = JSON.parse(raw);
      return Object.values(p.terms?.OnDemand ?? {}).flatMap((t: any) =>
        Object.values(t.priceDimensions ?? {})
          .filter((d: any) => d.unit === unit && d.beginRange === "0")
          .map((d: any) => Number(d.pricePerUnit.USD)),
      );
    })
    .filter((n) => Number.isFinite(n) && n > 0);
}
export class AwsProvider implements CloudProvider {
  async observe(worker: Worker) {
    const i = (
      await new EC2Client({ region: worker.region }).send(
        new DescribeInstancesCommand({ InstanceIds: [worker.instanceId!] }),
      )
    ).Reservations?.[0]?.Instances?.[0];
    if (
      !i?.Tags?.some((t) => t.Key === "FleetWorkerId" && t.Value === worker.id)
    )
      throw new Error("Worker instance ownership could not be verified");
    return i.State?.Name ?? "unknown";
  }

  async identity(region: string) {
    const result = await new STSClient({ region }).send(
      new GetCallerIdentityCommand({}),
    );
    if (!result.Account)
      throw new Error("Provider account identity is unavailable");
    return result.Account;
  }
  async dataVolume(worker: Worker) {
    const instance = (
      await new EC2Client({ region: worker.region }).send(
        new DescribeInstancesCommand({ InstanceIds: [worker.instanceId!] }),
      )
    ).Reservations?.[0]?.Instances?.[0];
    if (
      !instance?.Tags?.some(
        (t) => t.Key === "FleetWorkerId" && t.Value === worker.id,
      )
    )
      throw new Error("Worker instance ownership is not verified");
    const mapping = instance.BlockDeviceMappings?.find(
      (m) =>
        m.DeviceName === "/dev/sdf" && m.Ebs?.DeleteOnTermination === false,
    );
    if (!mapping?.Ebs?.VolumeId)
      throw new Error("Retained data volume identity is unavailable");
    return mapping.Ebs.VolumeId;
  }

  async discovery(
    region: string,
    clients?: {
      ec2: Pick<EC2Client, "send">;
      sts: Pick<STSClient, "send">;
      iam: Pick<IAMClient, "send">;
    },
  ) {
    const ec2 = clients?.ec2 ?? new EC2Client({ region });
    const [identity, regions, types] = await Promise.all([
      (clients?.sts ?? new STSClient({ region })).send(
        new GetCallerIdentityCommand({}),
      ),
      ec2.send(new DescribeRegionsCommand({})),
      ec2.send(
        new DescribeInstanceTypesCommand({
          InstanceTypes: ["m7i.large", "m7i.xlarge", "m7i.2xlarge"],
        }),
      ),
    ]);
    const subnets: any[] = [],
      securityGroups: any[] = [],
      endpoints: any[] = [];
    let next: string | undefined,
      subnetsTruncated = false,
      groupsTruncated = false,
      endpointsTruncated = false;
    for (let page = 0; page < 20; page++) {
      const result = await ec2.send(
        new DescribeSubnetsCommand({ MaxResults: 100, NextToken: next }),
      );
      subnets.push(
        ...(result.Subnets ?? []).map((s) => ({
          id: s.SubnetId,
          vpcId: s.VpcId,
          availabilityZone: s.AvailabilityZone,
          availableAddresses: s.AvailableIpAddressCount,
          autoAssignPublicIPv4: s.MapPublicIpOnLaunch,
          networkVerified: false,
        })),
      );
      next = result.NextToken;
      if (!next) break;
      subnetsTruncated = page === 19;
    }
    let groupsAvailable = true;
    next = undefined;
    try {
      for (let page = 0; page < 20; page++) {
        const result: DescribeSecurityGroupsCommandOutput = await ec2.send(
          new DescribeSecurityGroupsCommand({
            MaxResults: 100,
            NextToken: next,
          }),
        );
        securityGroups.push(
          ...(result.SecurityGroups ?? []).map((s) => ({
            id: s.GroupId,
            name: s.GroupName,
            vpcId: s.VpcId,
            description: s.Description,
            permissionsVerified: false,
          })),
        );
        next = result.NextToken;
        if (!next) break;
        groupsTruncated = page === 19;
      }
    } catch {
      groupsAvailable = false;
    }
    let endpointsAvailable = true;
    next = undefined;
    try {
      for (let page = 0; page < 20; page++) {
        const result: DescribeVpcEndpointsCommandOutput = await ec2.send(
          new DescribeVpcEndpointsCommand({
            MaxResults: 100,
            NextToken: next,
            Filters: [
              {
                Name: "service-name",
                Values: [
                  `com.amazonaws.${region}.ssm`,
                  `com.amazonaws.${region}.ssmmessages`,
                  `com.amazonaws.${region}.ec2messages`,
                ],
              },
            ],
          }),
        );
        endpoints.push(
          ...(result.VpcEndpoints ?? []).map((e) => ({
            id: e.VpcEndpointId,
            vpcId: e.VpcId,
            serviceName: e.ServiceName,
            state: e.State,
            privateDnsEnabled: e.PrivateDnsEnabled,
            subnetIds: e.SubnetIds,
            networkVerified: false,
          })),
        );
        next = result.NextToken;
        if (!next) break;
        endpointsTruncated = page === 19;
      }
    } catch {
      endpointsAvailable = false;
    }
    const profiles: any[] = [];
    let profilesAvailable = true,
      profilesTruncated = false;
    let marker: string | undefined;
    try {
      const iam = clients?.iam ?? new IAMClient({ region });
      for (let page = 0; page < 20; page++) {
        const result = await iam.send(
          new ListInstanceProfilesCommand({ MaxItems: 100, Marker: marker }),
        );
        profiles.push(
          ...(result.InstanceProfiles ?? []).map((p) => ({
            name: p.InstanceProfileName,
            arn: p.Arn,
            roleNames: p.Roles?.map((r) => r.RoleName),
            permissionsVerified: false,
          })),
        );
        if (!result.IsTruncated) break;
        marker = result.Marker;
        profilesTruncated = page === 19;
        if (!marker) throw new Error("Incomplete profile pagination");
      }
    } catch {
      profilesAvailable = false;
    }
    return {
      account: identity.Account,
      regions: regions.Regions?.map((r) => r.RegionName),
      subnets,
      securityGroups,
      instanceProfiles: profiles,
      discoveryState: {
        subnets: { available: true, truncated: subnetsTruncated },
        securityGroups: {
          available: groupsAvailable,
          truncated: groupsTruncated,
        },
        instanceProfiles: {
          available: profilesAvailable,
          truncated: profilesTruncated,
          reason: profilesAvailable
            ? undefined
            : "Existing instance profiles could not be listed. Grant read access or supply an existing worker profile through the reviewed launch form.",
        },
      },
      network: {
        automaticSetup: false,
        verified: false,
        endpointsAvailable,
        endpointsTruncated,
        endpoints,
        requirements: [
          "Worker role permissions for Systems Manager and scoped package downloads must be configured.",
          "Outbound HTTPS and DNS must reach regional Systems Manager control and message endpoints.",
          "Public release downloads require an approved outbound HTTPS route.",
          "Existing endpoint, route, DNS, ACL and security-group listings are not connectivity verification.",
        ],
        setupRequired:
          subnets.length === 0 ||
          securityGroups.length === 0 ||
          profiles.length === 0,
      },
      instanceTypes: types.InstanceTypes?.map((t) => ({
        name: t.InstanceType,
        vcpus: t.VCpuInfo?.DefaultVCpus,
        memoryMiB: t.MemoryInfo?.SizeInMiB,
      })),
      imageParameter:
        "/aws/service/ami-windows-latest/Windows_Server-2025-English-Full-Base",
    };
  }
  async estimate(spec: LaunchSpec): Promise<CostEstimate> {
    const base: CostEstimate = {
      available: false,
      currency: "USD",
      source: "AWS Price List GetProducts",
      retrievedAt: new Date().toISOString(),
      exclusions: [
        "Taxes",
        "Data transfer",
        "Snapshots",
        "CloudWatch and Systems Manager usage",
        "Public IPv4 addresses",
      ],
      reason: "Provider pricing is unavailable.",
    };
    try {
      const client = new PricingClient({ region: "us-east-1" });
      const get = (fields: Record<string, string>) =>
        client.send(
          new GetProductsCommand({
            ServiceCode: "AmazonEC2",
            Filters: Object.entries(fields).map(([Field, Value]) => ({
              Type: "TERM_MATCH",
              Field,
              Value,
            })),
            MaxResults: 100,
          }),
        );
      const [compute, storage] = await Promise.all([
        get({
          regionCode: spec.region,
          instanceType: spec.instanceType,
          operatingSystem: "Windows",
          tenancy: "Shared",
          preInstalledSw: "NA",
          capacitystatus: "Used",
        }),
        get({
          regionCode: spec.region,
          volumeApiName: "gp3",
          productFamily: "Storage",
        }),
      ]);
      const c = [...new Set(prices(compute.PriceList, "Hrs"))];
      const s = [...new Set(prices(storage.PriceList, "GB-Mo"))];
      if (
        compute.NextToken ||
        storage.NextToken ||
        c.length !== 1 ||
        s.length !== 1
      )
        return {
          ...base,
          reason:
            "A unique complete compute and storage rate could not be resolved.",
        };
      const monthly =
        spec.count * (c[0] * 730 + (spec.bootGiB + spec.dataGiB) * s[0]);
      return {
        ...base,
        available: true,
        reason: undefined,
        hourly: monthly / 730,
        monthly,
      };
    } catch {
      return base;
    }
  }
  async launch(
    spec: LaunchSpec,
    key: string,
    ids: string[],
  ): Promise<string[]> {
    const ec2 = new EC2Client({ region: spec.region });
    const parameter = await new SSMClient({ region: spec.region }).send(
      new GetParameterCommand({
        Name: "/aws/service/ami-windows-latest/Windows_Server-2025-English-Full-Base",
      }),
    );
    if (!parameter.Parameter?.Value)
      throw new Error("Official image unavailable");
    const image = (
      await ec2.send(
        new DescribeImagesCommand({
          ImageIds: [parameter.Parameter.Value],
          Owners: ["amazon"],
        }),
      )
    ).Images?.[0];
    if (!image?.RootDeviceName)
      throw new Error("Official image metadata unavailable");
    const result: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const launched = await ec2.send(
        new RunInstancesCommand({
          ImageId: image.ImageId,
          InstanceType: spec.instanceType as any,
          MinCount: 1,
          MaxCount: 1,
          ClientToken: `${key}-${i}`,
          SubnetId: spec.subnetId,
          SecurityGroupIds: [spec.securityGroupId],
          IamInstanceProfile: { Name: spec.instanceProfile },
          MetadataOptions: {
            HttpTokens: "required",
            HttpEndpoint: "enabled",
            HttpPutResponseHopLimit: 1,
          },
          BlockDeviceMappings: [
            {
              DeviceName: image.RootDeviceName,
              Ebs: {
                VolumeSize: spec.bootGiB,
                VolumeType: "gp3",
                Encrypted: true,
                DeleteOnTermination: true,
              },
            },
            {
              DeviceName: "/dev/sdf",
              Ebs: {
                VolumeSize: spec.dataGiB,
                VolumeType: "gp3",
                Encrypted: true,
                DeleteOnTermination: false,
              },
            },
          ],
          TagSpecifications: [
            {
              ResourceType: "instance",
              Tags: [
                { Key: "Name", Value: `Slop Machine Fleet ${ids[i]}` },
                { Key: "ManagedBy", Value: "slop-machine-fleet" },
                { Key: "FleetWorkerId", Value: ids[i] },
                { Key: "FleetOperationId", Value: key },
              ],
            },
            {
              ResourceType: "volume",
              Tags: [
                { Key: "ManagedBy", Value: "slop-machine-fleet" },
                { Key: "FleetWorkerId", Value: ids[i] },
                { Key: "FleetOperationId", Value: key },
              ],
            },
          ],
        }),
      );
      const id = launched.Instances?.[0]?.InstanceId;
      if (!id) throw new Error("Launch did not return an instance identifier");
      result.push(id);
    }
    return result;
  }
  async action(worker: any, action: WorkerAction) {
    if (!worker.instanceId) throw new Error("Worker has no provider instance");
    const client = new EC2Client({ region: worker.region });
    const instance = (
      await client.send(
        new DescribeInstancesCommand({ InstanceIds: [worker.instanceId] }),
      )
    ).Reservations?.[0]?.Instances?.[0];
    if (
      !instance?.Tags?.some(
        (t) => t.Key === "FleetWorkerId" && t.Value === worker.id,
      )
    )
      throw new Error("Instance ownership could not be verified");
    const input = { InstanceIds: [worker.instanceId] };
    if (action === "start") await client.send(new StartInstancesCommand(input));
    else if (action === "stop")
      await client.send(new StopInstancesCommand(input));
    else if (action === "restart")
      await client.send(new RebootInstancesCommand(input));
    else if (action === "terminate")
      await client.send(new TerminateInstancesCommand(input));
    else throw new Error("This action requires an enrolled worker transport");
  }
}
