"use client";

import { Badge, Box, Button, Heading, HStack, SimpleGrid, Spinner, Stack, Text } from "@chakra-ui/react";
import { useDashboard, when } from "@/components/dashboard-context";
import { GlassCard, PageHeader, StatusBadge } from "@/components/dashboard-ui";

export default function HomePage() {
  const { state, busy, post } = useDashboard();
  const admin = state?.current_user_is_admin === true;
  const history = (state?.history || []).slice().reverse().slice(0, 5);
  const logs = (state?.logs || []).slice().reverse().slice(0, 5);

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`Welcome${state?.current_user ? `, ${state.current_user}` : ""}`}
        description="See the tunnel at a glance and generate a fresh Cloudflare WARP configuration when you need one."
        action={
          <Button
            size="lg"
            bg="cyan.400"
            color="gray.950"
            _hover={{ bg: "cyan.300" }}
            loading={busy}
            disabled={!admin || state?.status === "running"}
            onClick={() => post("/api/update", {}, "Configuration update started.")}
          >
            Update config now
          </Button>
        }
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
            <Box><Text color="gray.500" fontSize="xs">MANAGED CONFIG</Text><Text color="gray.100" fontSize="sm" mt="1">{state?.config_filename || "wg0.conf"}</Text></Box>
          </Stack>
        </GlassCard>
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, xl: 2 }} gap="5">
        <GlassCard p="6">
          <Heading color="gray.50" size="md" mb="5">Recent update status</Heading>
          <Stack gap="4">
            {history.length ? history.map((item, index) => (
              <Box key={`${item.started_at}-${index}`} pb="4" borderBottomWidth={index === history.length - 1 ? 0 : 1} borderColor="rgba(148, 163, 184, 0.14)">
                <HStack justify="space-between" align="start" gap="3">
                  <HStack><Badge colorPalette={item.result === "failed" ? "red" : "teal"}>{item.result}</Badge><Text color="gray.200" fontSize="sm">{item.source}</Text></HStack>
                  <Text color="gray.500" fontSize="xs" textAlign="right">{when(item.started_at)}</Text>
                </HStack>
                {item.error && <Text color="red.200" fontSize="sm" mt="2">{item.error}</Text>}
              </Box>
            )) : <Text color="gray.400">No update attempts recorded yet.</Text>}
          </Stack>
        </GlassCard>

        <GlassCard p="6">
          <Heading color="gray.50" size="md" mb="5">Recent service activity</Heading>
          <Stack gap="4">
            {logs.length ? logs.map((item, index) => (
              <Box key={`${item.at}-${index}`} pb="4" borderBottomWidth={index === logs.length - 1 ? 0 : 1} borderColor="rgba(148, 163, 184, 0.14)">
                <HStack justify="space-between" align="start" gap="3">
                  <Badge variant="outline" color="gray.200" borderColor="gray.600">{item.level}</Badge>
                  <Text color="gray.500" fontSize="xs">{when(item.at)}</Text>
                </HStack>
                <Text color="gray.200" mt="2" fontSize="sm">{item.message}</Text>
              </Box>
            )) : <Text color="gray.400">No service activity recorded yet.</Text>}
          </Stack>
        </GlassCard>
      </SimpleGrid>
    </>
  );
}
