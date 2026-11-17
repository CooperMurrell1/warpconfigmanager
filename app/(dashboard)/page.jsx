"use client";

import { Box, Heading, HStack, SimpleGrid, Spinner, Stack, Text } from "@chakra-ui/react";
import { useDashboard, when } from "@/components/dashboard-context";
import { GlassCard, PageHeader, StatusBadge } from "@/components/dashboard-ui";

export default function HomePage() {
  const { state } = useDashboard();
  const activeConfigName = state?.saved_configs?.find(item => item.interface_public_key && item.interface_public_key === state?.config?.interface_public_key)?.name || "Active config";

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`Welcome${state?.current_user ? `, ${state.current_user}` : ""}`}
        description=""
      />

      <SimpleGrid columns={{ base: 1, lg: 3 }} gap="5" mb="5">
        <GlassCard p={{ base: "5", md: "7" }} gridColumn={{ lg: "span 2" }} position="relative" overflow="hidden">
          <Box position="absolute" inset="auto -5rem -8rem auto" width="18rem" height="18rem" rounded="full" bg="rgba(34, 211, 238, 0.10)" filter="blur(18px)" />
          <Text color="gray.400" fontWeight="700" fontSize="sm">PUBLIC IP THROUGH ACTIVE TUNNEL</Text>
          <Heading color={state?.ip?.address ? "cyan.200" : "orange.200"} size={{ base: "xl", md: "3xl" }} mt="3" overflowWrap="anywhere">
            {state?.ip?.address || (state?.ip?.error ? "IP probe unavailable" : "Checking tunnel…")}
          </Heading>
          <Text color={state?.ip?.error ? "red.200" : "gray.300"} mt="4">
            {state?.ip?.error || `Checked ${when(state?.ip?.checked_at)}`}
          </Text>
          <SimpleGrid columns={{ base: 1, sm: 3 }} gap="4" mt="6" pt="4" borderTopWidth="1px" borderColor="rgba(148, 163, 184, 0.18)">
            <Box><Text color="gray.500" fontSize="xs">WARP ACCOUNT</Text><Text color="gray.100" fontSize="sm" mt="1">{state?.warp_account?.account_type || "Not collected"}</Text></Box>
            <Box><Text color="gray.500" fontSize="xs">ACCOUNT ID</Text><Text color="gray.200" fontSize="sm" mt="1" fontFamily="mono" overflowWrap="anywhere">{state?.warp_account?.account_id || "Not available"}</Text></Box>
            <Box><Text color="gray.500" fontSize="xs">WARP DEVICE ID</Text><Text color="gray.200" fontSize="sm" mt="1" fontFamily="mono" overflowWrap="anywhere">{state?.warp_account?.device_id || "Not available"}</Text></Box>
          </SimpleGrid>
        </GlassCard>

        <GlassCard p="6">
          <Text color="gray.400" fontWeight="700" fontSize="sm">CURRENT STATUS</Text>
          <HStack mt="4" gap="3"><StatusBadge status={state?.status} />{state?.status === "running" && <Spinner size="sm" color="yellow.200" />}</HStack>
          <Stack gap="3" mt="6">
            <Box><Text color="gray.500" fontSize="xs">LAST SUCCESS</Text><Text color="gray.100" fontSize="sm" mt="1">{when(state?.last_success_at)}</Text></Box>
            <Box><Text color="gray.500" fontSize="xs">NEXT SCHEDULED RUN</Text><Text color="gray.100" fontSize="sm" mt="1">{when(state?.next_run_at)}</Text></Box>
            <Box><Text color="gray.500" fontSize="xs">ACTIVE CONFIG</Text><Text color="gray.100" fontSize="sm" mt="1">{activeConfigName}</Text></Box>
          </Stack>
        </GlassCard>
      </SimpleGrid>

    </>
  );
}
