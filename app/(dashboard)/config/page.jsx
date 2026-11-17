"use client";

import { Alert, Box, Heading, SimpleGrid, Text } from "@chakra-ui/react";
import { useDashboard, when } from "@/components/dashboard-context";
import { Detail, GlassCard, PageHeader, StatusBadge } from "@/components/dashboard-ui";

export default function ConfigPage() {
  const { state } = useDashboard();
  const config = state?.config;

  return (
    <>
      <PageHeader
        eyebrow="WireGuard"
        title="Current configuration"
        description="Safe, non-secret details from the currently installed WireGuard configuration. Private keys and complete config contents are never returned to this page."
      />

      <SimpleGrid columns={{ base: 1, lg: 3 }} gap="5" mb="5">
        <GlassCard p="6"><Detail label="Selected file">{state?.config_filename || "wg0.conf"}</Detail></GlassCard>
        <GlassCard p="6"><Text color="gray.400" fontSize="xs" fontWeight="700" letterSpacing="0.08em">GENERATOR STATUS</Text><Box mt="2"><StatusBadge status={state?.status} /></Box></GlassCard>
        <GlassCard p="6"><Detail label="Last successful update">{when(state?.last_success_at)}</Detail></GlassCard>
      </SimpleGrid>

      <GlassCard p={{ base: "5", md: "7" }} mb="5">
        <Heading color="gray.50" size="md" mb="6">Interface and peer details</Heading>
        {config ? (
          <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} gap={{ base: "6", md: "8" }}>
            <Detail label="Interface address">{config.address}</Detail>
            <Detail label="DNS">{config.dns || "Not specified"}</Detail>
            <Detail label="MTU">{config.mtu || "Default"}</Detail>
            <Detail label="Allowed IPs">{config.allowed_ips}</Detail>
            <Detail label="Endpoint">{config.endpoint}</Detail>
            <Detail label="Persistent keepalive">{config.keepalive ? `${config.keepalive} seconds` : "Disabled"}</Detail>
          </SimpleGrid>
        ) : (
          <Text color="red.200">No usable configuration is currently installed.</Text>
        )}
      </GlassCard>

      <Alert.Root status="warning" rounded="2xl" bg="rgba(120, 53, 15, 0.48)" borderWidth="1px" borderColor="rgba(251, 146, 60, 0.25)" color="orange.50" p="5">
        <Alert.Indicator />
        <Box>
          <Alert.Title>Routing and exit-IP warning</Alert.Title>
          <Alert.Description color="orange.100" mt="1">
            Replacing this file can change the VPN tunnel&apos;s public exit IP and routing behavior after the VPN container next loads it. The manager does not restart the stack.
          </Alert.Description>
        </Box>
      </Alert.Root>
    </>
  );
}
