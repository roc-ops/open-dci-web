/**
 * Config type detection — distinguishes PacketCable MTA configs from CM configs.
 *
 * PacketCable MTA config files contain primarily SnmpMibObject entries and lack
 * CM-specific TLVs like service flows, network access, and channel configs.
 */
import { parse as jsoncParse } from "jsonc-parser";

/** Top-level keys that only appear in CM (Cable Modem) configs. */
const CM_ONLY_KEYS = new Set([
  "DownstreamServiceFlow",
  "UpstreamServiceFlow",
  "NetworkAccess",
  "MaxNumCpes",
  "DownstreamChannelList",
  "UpstreamChannelId",
  "BaselinePrivacy",
  "DownstreamPacketClassification",
  "UpstreamPacketClassification",
  "GlobalPrivacyEnable",
  "MaxNumClassifiers",
  "UpstreamDropPacketClassification",
  "UpstreamDropClassifierGroupId",
  "MaxSubscriberQos",
  "TelephonySettings",
  "DsChannelList",
  "DefaultScanTimeout",
]);

/**
 * Detect whether the editor content represents a PacketCable MTA config.
 * Returns true if the config has SnmpMibObject entries and no CM-specific keys.
 */
export function detectPacketCable(content: string): boolean {
  try {
    const parsed = jsoncParse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;

    const keys = Object.keys(parsed);
    if (keys.length === 0) return false;

    const hasSnmpMibObject = keys.includes("SnmpMibObject");
    if (!hasSnmpMibObject) return false;

    const hasCmKey = keys.some((k) => CM_ONLY_KEYS.has(k));
    return !hasCmKey;
  } catch {
    return false;
  }
}
