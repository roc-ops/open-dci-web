/**
 * Example DOCSIS configurations.
 * Each example provides realistic JSONC content that can be loaded into the editor.
 */

export interface ExampleConfig {
  name: string;
  description: string;
  content: string;
}

export const EXAMPLE_CONFIGS: ExampleConfig[] = [
  {
    name: "Basic CM",
    description: "Simple cable modem with upstream/downstream service flows",
    content: `{
  // Basic Cable Modem Configuration
  // Provides a simple downstream/upstream service flow pair
  // with network access enabled.

  "NetworkAccess": 1, // enabled
  "MaxNumCpes": 2, // allow up to 2 CPE devices

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
    description: "Config with MtaConfigDelimiter and PacketCable settings",
    content: `{
  // MTA / PacketCable Configuration
  // Includes MtaConfigDelimiter to wrap embedded MTA settings
  // for telephony (voice) provisioning.

  "NetworkAccess": 1, // enabled
  "MaxNumCpes": 2,

  "DownstreamServiceFlow": [
    {
      "ServiceFlowReference": 20,
      "QosParamSetType": 7, // provisioned, admitted, and active set
      "DataRateUnitSetting": 2, // mega-bits per second (Mbps)
      "MaxSustainedTrafficRate": 250,
      "MaxTrafficBurst": 500000
    }
  ],

  "UpstreamServiceFlow": [
    {
      "ServiceFlowReference": 10,
      "QosParamSetType": 7, // provisioned, admitted, and active set
      "DataRateUnitSetting": 2, // mega-bits per second (Mbps)
      "MaxSustainedTrafficRate": 25,
      "MaxTrafficBurst": 250000
    }
  ],

  // MTA configuration delimiter — wraps PacketCable / telephony TLVs
  "MtaConfigDelimiter": {
    "MtaStartOfMtaConfig": 1,
    "MtaEndOfMtaConfig": 255,

    // Telephony provisioning server
    "SnmpMibObject": [
      {
        "MibOid": "1.3.6.1.4.1.4491.2.2.1.1.2.7.0",
        "MibValue": "1",
        "MibType": 2 // integer
      },
      {
        "MibOid": "1.3.6.1.4.1.4491.2.2.1.1.2.1.0",
        "MibValue": "10.0.0.1",
        "MibType": 4 // IP address
      }
    ]
  }
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

  "NetworkAccess": 1, // enabled
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
      "ServiceFlowReference": 22,
      "QosParamSetType": 7, // provisioned, admitted, and active set
      "DataRateUnitSetting": 2, // mega-bits per second (Mbps)
      "MaxSustainedTrafficRate": 10,
      "MaxTrafficBurst": 100000,
      "TrafficPriority": 7,
      "MaxLatency": 10000 // 10 ms
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
      "ServiceFlowReference": 12,
      "QosParamSetType": 7, // provisioned, admitted, and active set
      "DataRateUnitSetting": 2, // mega-bits per second (Mbps)
      "MaxSustainedTrafficRate": 2,
      "MaxTrafficBurst": 50000,
      "TrafficPriority": 7,
      "SchedulingType": 2, // real-time polling service
      "MaxLatency": 10000 // 10 ms
    }
  ],

  "DownstreamPacketClassifier": [
    {
      // Classify VoIP traffic (UDP, SIP port)
      "ClassifierReference": 100,
      "ServiceFlowReference": 22,
      "RulePriority": 64,
      "IpPacketClassifier": {
        "IpProtocol": 17, // UDP
        "SourcePortStart": 5060,
        "SourcePortEnd": 5061
      }
    }
  ],

  "UpstreamPacketClassifier": [
    {
      // Classify VoIP traffic (UDP, SIP port)
      "ClassifierReference": 200,
      "ServiceFlowReference": 12,
      "RulePriority": 64,
      "IpPacketClassifier": {
        "IpProtocol": 17, // UDP
        "DestPortStart": 5060,
        "DestPortEnd": 5061
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

  "NetworkAccess": 1, // enabled
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
    "AuthorizationWaitTimeout": 10, // seconds
    "ReauthorizationWaitTimeout": 10, // seconds
    "AuthorizationGraceTime": 600, // seconds
    "OperationalWaitTimeout": 1, // seconds
    "RekeyWaitTimeout": 1, // seconds
    "TEKGraceTime": 600, // seconds
    "AuthorizationRejectWaitTimeout": 60, // seconds
    "SAMapWaitTimeout": 1, // seconds
    "SAMapMaxRetries": 4
  }
}
`,
  },
  {
    name: "Vendor-Specific",
    description: "Config using VendorSpecific with VendorIdentifier and GenericTLV",
    content: `{
  // Vendor-Specific Configuration
  // Demonstrates the VendorSpecific TLV for encoding
  // vendor-proprietary settings using GenericTLV entries.

  "NetworkAccess": 1, // enabled
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

  // Vendor-specific information for custom device configuration
  "VendorSpecific": [
    {
      // VendorIdentifier is the vendor's OUI (3-byte hex string)
      "VendorIdentifier": "00 10 18",
      "GenericTLV": [
        {
          // Example: enable a proprietary feature (type 1, value 01 = on)
          "TlvCode": 1,
          "TlvLength": 1,
          "TlvValue": "01"
        },
        {
          // Example: set a proprietary string parameter (type 2)
          "TlvCode": 2,
          "TlvLength": 11,
          "TlvValue": "68 65 6C 6C 6F 20 77 6F 72 6C 64"
        }
      ]
    }
  ]
}
`,
  },
];
