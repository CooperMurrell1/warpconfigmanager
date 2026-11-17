"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Alert, Box, Button, Container, Flex, Heading, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { DashboardProvider, useDashboard } from "@/components/dashboard-context";
import { ProfileAvatar } from "@/components/profile-avatar";

const navItems = [
  { href: "/", label: "Home", mark: "H" },
  { href: "/config", label: "Config", mark: "C" },
  { href: "/logs", label: "Logs", mark: "L" },
  { href: "/settings", label: "Settings", mark: "S" },
  { href: "/accounts", label: "Accounts", mark: "A", adminOnly: true },
];

function NavGlyph({ name }) {
  const paths = {
    Home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    Config: <><path d="M4 5h16M4 12h16M4 19h16" /><circle cx="9" cy="5" r="2" fill="currentColor" /><circle cx="15" cy="12" r="2" fill="currentColor" /><circle cx="8" cy="19" r="2" fill="currentColor" /></>,
    Logs: <><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /></>,
    Settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.6.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.6-.9l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.9l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.6-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.6.9l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.8Z" transform="translate(-1 -1) scale(.95)" /></>,
    Accounts: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 3.5 4.8" /></>,
  };
  return <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function NavItem({ item, compact = false }) {
  const pathname = usePathname();
  const active = pathname === item.href;
  return (
    <Box
      asChild
      rounded="xl"
      bg={active ? "rgba(34, 211, 238, 0.14)" : "transparent"}
      borderWidth="1px"
      borderColor={active ? "rgba(103, 232, 249, 0.28)" : "transparent"}
      color={active ? "cyan.100" : "gray.300"}
      _hover={{ bg: "rgba(148, 163, 184, 0.10)", color: "gray.50" }}
      transition="all 160ms ease"
      flex={compact ? "1" : undefined}
      minW="0"
      maxW="100%"
      overflow="hidden"
    >
      <Link href={item.href}>
        <HStack width="full" minW="0" px={compact ? "1" : "4"} py={compact ? "2" : "3"} flexDirection={compact ? "column" : "row"} justify={compact ? "center" : "start"} gap={compact ? "1" : "3"}>
          <Box flexShrink="0" width="7" height="7" rounded="lg" bg={active ? "cyan.400" : "rgba(148, 163, 184, 0.14)"} color={active ? "gray.950" : "gray.200"} display="grid" placeItems="center"><NavGlyph name={item.label} /></Box>
          <Text minW="0" maxW="full" textAlign="center" lineHeight="shorter" whiteSpace="normal" fontWeight="700" fontSize={compact ? "xs" : "sm"}>{item.label}</Text>
        </HStack>
      </Link>
    </Box>
  );
}

function DashboardLoading() {
  return (
    <Box minH="100vh" display="grid" placeItems="center" px="5" py="10" color="gray.100" overflow="hidden">
      <Box className="dashboard-loading-glow" position="absolute" width="22rem" height="22rem" rounded="full" bg="rgba(34, 211, 238, 0.12)" filter="blur(80px)" />
      <Box className="dashboard-loading-card" position="relative" width="full" maxW="md" textAlign="center" p={{ base: "7", md: "10" }} rounded="3xl" bg="rgba(15, 23, 42, 0.68)" borderWidth="1px" borderColor="rgba(148, 163, 184, 0.2)" backdropFilter="blur(24px)" boxShadow="0 28px 90px rgba(0, 0, 0, 0.42)">
        <Box position="relative" display="grid" placeItems="center" width="16" height="16" mx="auto" mb="6">
          <Spinner position="absolute" size="xl" color="cyan.300" borderWidth="2px" />
          <Box as="img" src="/jellyfin-icon.svg" alt="" width="7" height="7" />
        </Box>
        <Text color="cyan.300" fontSize="xs" fontWeight="800" letterSpacing="0.18em">WARP CONFIG MANAGER</Text>
        <Heading color="gray.50" size="lg" mt="2">Loading your dashboard</Heading>
        <Text color="gray.400" mt="3">Getting the latest tunnel and schedule information…</Text>
        <Box className="dashboard-loading-track" position="relative" overflow="hidden" height="1" rounded="full" bg="rgba(148, 163, 184, 0.18)" mt="8">
          <Box className="dashboard-loading-beam" position="absolute" inset="0 auto 0 0" width="40%" rounded="full" bg="linear-gradient(90deg, transparent, #67e8f9, transparent)" />
        </Box>
      </Box>
    </Box>
  );
}

function DashboardLoadError({ error, refresh, logout }) {
  return (
    <Box minH="100vh" display="grid" placeItems="center" px="5" py="10" color="gray.100">
      <Box width="full" maxW="md" textAlign="center" p={{ base: "7", md: "10" }} rounded="3xl" bg="rgba(15, 23, 42, 0.72)" borderWidth="1px" borderColor="rgba(248, 113, 113, 0.28)" backdropFilter="blur(24px)" boxShadow="0 28px 90px rgba(0, 0, 0, 0.42)">
        <Heading color="gray.50" size="lg">Dashboard unavailable</Heading>
        <Text color="red.200" mt="3">{error || "Could not load service state"}</Text>
        <HStack justify="center" mt="7" gap="3">
          <Button bg="cyan.400" color="gray.950" _hover={{ bg: "cyan.300" }} onClick={() => refresh(true)}>Try again</Button>
          <Button variant="outline" borderColor="gray.600" color="gray.100" onClick={logout}>Sign out</Button>
        </HStack>
      </Box>
    </Box>
  );
}

function ShellContent({ children }) {
  const { state, loading, error, notice, logout, refresh } = useDashboard();

  if (loading) return <DashboardLoading />;
  if (!state) return <DashboardLoadError error={error} refresh={refresh} logout={logout} />;

  return (
    <Box minH="100vh" color="gray.100">
      <Flex
        as="aside"
        display={{ base: "none", md: "flex" }}
        position="fixed"
        insetY="0"
        left="0"
        width="260px"
        zIndex="20"
        flexDirection="column"
        bg="rgba(7, 11, 20, 0.72)"
        borderRightWidth="1px"
        borderColor="rgba(148, 163, 184, 0.14)"
        backdropFilter="blur(24px)"
        p="5"
      >
        <HStack px="2" py="3" mb="7" gap="3">
          <Box as="img" src="/jellyfin-icon.svg" alt="Jellyfin" width="10" height="10" />
          <Box><Text color="cyan.300" fontWeight="900" fontSize="xs" letterSpacing="0.18em">WARP TUNNEL</Text><Text color="gray.50" fontWeight="800" fontSize="lg" mt="1">Config Manager</Text></Box>
        </HStack>
        <Stack gap="2">{navItems.filter(item => !item.adminOnly || state?.current_user_is_admin).map(item => <NavItem key={item.href} item={item} />)}</Stack>
      </Flex>

      <Box ml={{ base: "0", md: "260px" }} minH="100vh">
        <Flex
          as="header"
          position="sticky"
          top="0"
          zIndex="15"
          minH="72px"
          align="center"
          justify="space-between"
          px={{ base: "4", md: "7" }}
          bg="rgba(7, 11, 20, 0.66)"
          borderBottomWidth="1px"
          borderColor="rgba(148, 163, 184, 0.12)"
          backdropFilter="blur(20px)"
        >
          <Box>
            <Text color="gray.400" fontSize="xs" fontWeight="700">MEDIA NETWORK TOOLS</Text>
            <Text color="gray.100" fontWeight="800">WARP dashboard</Text>
          </Box>
          <HStack gap="3">
            <Box display={{ base: "none", sm: "block" }} textAlign="right">
              <Text color="gray.100" fontSize="sm" fontWeight="700">{state?.current_user || "Jellyfin user"}</Text>
              <Text color="gray.400" fontSize="xs">{state?.current_user_is_admin ? "Administrator" : "Viewer"}</Text>
            </Box>
            <ProfileAvatar name={state?.current_user} />
            <Button size="sm" variant="outline" borderColor="rgba(148, 163, 184, 0.25)" color="gray.100" bg="rgba(15, 23, 42, 0.5)" _hover={{ bg: "rgba(148, 163, 184, 0.14)" }} onClick={logout}>Sign out</Button>
          </HStack>
        </Flex>

        <Box display={{ base: "block", md: "none" }} px="4" pt="4">
          <HStack width="full" minW="0" overflow="hidden" bg="rgba(15, 23, 42, 0.66)" borderWidth="1px" borderColor="rgba(148, 163, 184, 0.16)" backdropFilter="blur(18px)" rounded="2xl" p="1" gap="1">
            {navItems.filter(item => !item.adminOnly || state?.current_user_is_admin).map(item => <NavItem key={item.href} item={item} compact />)}
          </HStack>
        </Box>

        <Container className="dashboard-page" maxW="7xl" px={{ base: "4", md: "7" }} py={{ base: "6", md: "9" }}>
          {error && <Alert.Root status="error" mb="5" rounded="xl" bg="rgba(127, 29, 29, 0.55)" color="red.50"><Alert.Indicator /><Alert.Title>{error}</Alert.Title></Alert.Root>}
          {notice && <Alert.Root status="success" mb="5" rounded="xl" bg="rgba(6, 78, 59, 0.55)" color="green.50"><Alert.Indicator /><Alert.Title>{notice}</Alert.Title></Alert.Root>}
          {state && !state.current_user_is_admin && <Alert.Root status="warning" mb="5" rounded="xl" bg="rgba(120, 53, 15, 0.56)" color="orange.50"><Alert.Indicator /><Alert.Title>A Jellyfin administrator account is required to change settings or update the config.</Alert.Title></Alert.Root>}
          {state?.pending_apply && <Alert.Root status="warning" mb="5" rounded="xl" bg="rgba(120, 53, 15, 0.56)" color="orange.50"><Alert.Indicator /><Alert.Title>{state?.ip?.error ? `The selected config is not active in the running VPN tunnel: ${state.ip.error}` : "The selected config is not confirmed active in the running VPN tunnel. Check the latest generator log for activation details."}</Alert.Title></Alert.Root>}
          {children}
        </Container>
      </Box>
    </Box>
  );
}

export function DashboardShell({ children }) {
  return <DashboardProvider><ShellContent>{children}</ShellContent></DashboardProvider>;
}
