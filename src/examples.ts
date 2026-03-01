/**
 * Example DOCSIS configurations.
 * Each example provides realistic JSONC content that can be loaded into the editor.
 */

export type ConfigFormat = "cm" | "mta";

export interface ExampleConfig {
  name: string;
  description: string;
  content: string;
  format?: ConfigFormat;
}

export const EXAMPLE_CONFIGS: ExampleConfig[] = [
  {
    name: "Basic CM",
    description: "Simple cable modem with upstream/downstream service flows",
    content: `{
  // Basic Cable Modem Configuration
  // Provides a simple downstream/upstream service flow pair
  // with network access enabled.

  "NetworkAccess": 1, // enabled(1)
  "MaxNumCpes": 2,

  "DownstreamServiceFlow": [
    {
      "ServiceFlowReference": 20,
      "QosParamSetType": 7, // provisioned, admitted, and active set
      "DataRateUnitSetting": 2, // mega-bits per second (Mbps)
      "MaxSustainedTrafficRate": 500,
      "MaxTrafficBurst": 500000
    }
  ],

  "UpstreamServiceFlow": [
    {
      "ServiceFlowReference": 10,
      "QosParamSetType": 7, // provisioned, admitted, and active set
      "DataRateUnitSetting": 2, // mega-bits per second (Mbps)
      "MaxSustainedTrafficRate": 50,
      "MaxTrafficBurst": 250000
    }
  ]
}
`,
  },
  {
    name: "MTA / PacketCable",
    description: "Realistic PacketCable MTA config with NCS endpoint provisioning",
    format: "mta",
    content: `{
  // PacketCable MTA Configuration
  // Configures a 2-line MTA with NCS call agent, QoS TOS values,
  // and per-line endpoint settings.

  "MtaConfigDelimiter": 1, // Telephony Configuration File Start

  "SnmpMibObject": [
    // Enable MTA provisioning
    { "oid": "1.3.6.1.4.1.4491.2.2.1.1.1.7.0", "type": "Integer", "value": "1" },  // pktcMtaDevEnabled — true(1)

    // DNS server for MTA FQDN resolution
    { "oid": "1.3.6.1.4.1.4491.2.2.1.1.2.3.0", "type": "IPAddress", "value": "10.0.0.2" },  // pktcMtaDevServerDns1

    // QoS — TOS values for signaling and media
    { "oid": "1.3.6.1.4.1.4491.2.2.2.1.1.8.0", "type": "Integer", "value": "40" },  // pktcSigDefCallSigTos
    { "oid": "1.3.6.1.4.1.4491.2.2.2.1.1.9.0", "type": "Integer", "value": "46" },  // pktcSigDefMediaStreamTos

    // Line 1 (ifIndex 9) — NCS endpoint configuration
    { "oid": "1.3.6.1.4.1.4491.2.2.2.1.2.1.1.1.9", "type": "String", "value": "ca@cms.example.com" },  // pktcNcsEndPntConfigCallAgentId
    { "oid": "1.3.6.1.4.1.4491.2.2.2.1.2.1.1.2.9", "type": "Integer", "value": "2727" },  // pktcNcsEndPntConfigCallAgentUdpPort
    { "oid": "1.3.6.1.4.1.4491.2.2.2.1.2.1.1.28.9", "type": "Integer", "value": "10" },  // pktcNcsEndPntConfigCallWaitingDelay (seconds)
    { "oid": "1.3.6.1.4.1.4491.2.2.2.1.2.1.1.26.9", "type": "Integer", "value": "4" },  // pktcNcsEndPntConfigStatus — createAndGo(4)
    { "oid": "1.3.6.1.2.1.2.2.1.7.9", "type": "Integer", "value": "1" },  // ifAdminStatus — up(1)

    // Line 2 (ifIndex 10) — disable
    { "oid": "1.3.6.1.4.1.4491.2.2.2.1.2.1.1.26.10", "type": "Integer", "value": "6" },  // pktcNcsEndPntConfigStatus — destroy(6)
    { "oid": "1.3.6.1.2.1.2.2.1.7.10", "type": "Integer", "value": "2" },  // ifAdminStatus — down(2)

    // Config hash — must be last SnmpMibObject before end delimiter
    { "oid": "1.3.6.1.4.1.4491.2.2.1.1.2.6.0", "type": "HexString", "value": "0000000000000000000000000000000000000000" }  // pktcMtaDevProvConfigHash
  ]
}
`,
  },
  {
    name: "Advanced Service Flows",
    description: "Multiple service flows with classifiers for traffic shaping",
    content: `{
  // Advanced Service Flow Configuration
  // Demonstrates multiple upstream/downstream service flows
  // with packet classifiers for traffic prioritization.

  "NetworkAccess": 1, // enabled(1)
  "MaxNumCpes": 4,

  "DownstreamServiceFlow": [
    {
      // Best-effort downstream
      "ServiceFlowReference": 20,
      "QosParamSetType": 7, // provisioned, admitted, and active set
      "DataRateUnitSetting": 2, // mega-bits per second (Mbps)
      "MaxSustainedTrafficRate": 1000,
      "MaxTrafficBurst": 750000,
      "TrafficPriority": 1
    },
    {
      // Priority downstream for VoIP
      "ServiceFlowReference": 21,
      "QosParamSetType": 7, // provisioned, admitted, and active set
      "DataRateUnitSetting": 2, // mega-bits per second (Mbps)
      "MaxSustainedTrafficRate": 10,
      "MaxTrafficBurst": 100000,
      "TrafficPriority": 7,
      "MaxDownstreamLatency": 10000 // 10 ms in microseconds
    }
  ],

  "UpstreamServiceFlow": [
    {
      // Best-effort upstream
      "ServiceFlowReference": 10,
      "QosParamSetType": 7, // provisioned, admitted, and active set
      "DataRateUnitSetting": 2, // mega-bits per second (Mbps)
      "MaxSustainedTrafficRate": 100,
      "MaxTrafficBurst": 500000,
      "TrafficPriority": 1
    },
    {
      // Priority upstream for VoIP
      "ServiceFlowReference": 11,
      "QosParamSetType": 7, // provisioned, admitted, and active set
      "DataRateUnitSetting": 2, // mega-bits per second (Mbps)
      "MaxSustainedTrafficRate": 2,
      "MaxTrafficBurst": 50000,
      "TrafficPriority": 7,
      "SchedulingType": 4 // realTimePollingService(4)
    }
  ],

  "DownstreamPacketClassification": [
    {
      // Classify VoIP traffic (UDP, SIP port)
      "ClassifierReference": 100,
      "ServiceFlowReference": 21,
      "RulePriority": 64,
      "Ipv4Classification": {
        "IpProtocol": 17, // UDP
        "TcpUdpSourcePortStart": 5060,
        "TcpUdpSourcePortEnd": 5061
      }
    }
  ],

  "UpstreamPacketClassification": [
    {
      // Classify VoIP traffic (UDP, SIP port)
      "ClassifierReference": 200,
      "ServiceFlowReference": 11,
      "RulePriority": 64,
      "Ipv4Classification": {
        "IpProtocol": 17, // UDP
        "TcpUdpDestinationPortStart": 5060,
        "TcpUdpDestinationPortEnd": 5061
      }
    }
  ]
}
`,
  },
  {
    name: "BPI+ Security",
    description: "Config with BaselinePrivacy section for BPI+ encryption",
    content: `{
  // BPI+ Security Configuration
  // Enables Baseline Privacy Interface Plus (BPI+) for
  // encrypted communication between CM and CMTS.

  "NetworkAccess": 1, // enabled(1)
  "MaxNumCpes": 1,

  "DownstreamServiceFlow": [
    {
      "ServiceFlowReference": 20,
      "QosParamSetType": 7, // provisioned, admitted, and active set
      "DataRateUnitSetting": 2, // mega-bits per second (Mbps)
      "MaxSustainedTrafficRate": 500,
      "MaxTrafficBurst": 500000
    }
  ],

  "UpstreamServiceFlow": [
    {
      "ServiceFlowReference": 10,
      "QosParamSetType": 7, // provisioned, admitted, and active set
      "DataRateUnitSetting": 2, // mega-bits per second (Mbps)
      "MaxSustainedTrafficRate": 50,
      "MaxTrafficBurst": 250000
    }
  ],

  // Baseline Privacy Plus (BPI+) settings
  "BaselinePrivacy": {
    "AuthorizeWaitTimeout": 10, // seconds
    "ReauthorizeWaitTimeout": 10, // seconds
    "AuthorizationGraceTime": 600, // seconds
    "OperationalWaitTimeout": 1, // seconds
    "RekeyWaitTimeout": 1, // seconds
    "TekGraceTime": 600, // seconds
    "AuthorizeRejectWaitTimeout": 60, // seconds
    "SaMapWaitTimeout": 1, // seconds
    "SaMapMaxRetries": 4
  }
}
`,
  },
  {
    name: "Vendor-Specific",
    description: "Config using DocsisExtensionField with VendorId and VendorSubTlvs",
    content: `{
  // Vendor-Specific Configuration
  // Demonstrates DocsisExtensionField (TLV 43) for encoding
  // vendor-proprietary settings using VendorSubTlvs.

  "NetworkAccess": 1, // enabled(1)
  "MaxNumCpes": 1,

  "DownstreamServiceFlow": [
    {
      "ServiceFlowReference": 20,
      "QosParamSetType": 7, // provisioned, admitted, and active set
      "DataRateUnitSetting": 2, // mega-bits per second (Mbps)
      "MaxSustainedTrafficRate": 500,
      "MaxTrafficBurst": 500000
    }
  ],

  "UpstreamServiceFlow": [
    {
      "ServiceFlowReference": 10,
      "QosParamSetType": 7, // provisioned, admitted, and active set
      "DataRateUnitSetting": 2, // mega-bits per second (Mbps)
      "MaxSustainedTrafficRate": 50,
      "MaxTrafficBurst": 250000
    }
  ],

  // DOCSIS Extension Field (TLV 43) for vendor-specific settings
  "DocsisExtensionField": [
    {
      // VendorId is the vendor's OUI (3-byte hex string)
      "VendorId": "001018",
      "VendorSubTlvs": [
        {
          // Example: enable a proprietary feature (type 1, value 01 = on)
          "type": 1,
          "value": "01"
        },
        {
          // Example: set a proprietary hex parameter (type 2)
          "type": 2,
          "value": "68656C6C6F20776F726C64"
        }
      ]
    }
  ]
}
`,
  },
];
