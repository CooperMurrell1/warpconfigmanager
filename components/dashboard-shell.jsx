"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Alert, Box, Button, Container, Flex, HStack, Stack, Text } from "@chakra-ui/react";
import { DashboardProvider, useDashboard } from "@/components/dashboard-context";
import { ProfileAvatar } from "@/components/profile-avatar";

const navItems = [
  { href: "/", label: "Home", mark: "H" },
  { href: "/config", label: "Config", mark: "C" },
  { href: "/settings", label: "Settings", mark: "S" },
];

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
    >
      <Link href={item.href}>
        <HStack px={compact ? "3" : "4"} py="3" justify={compact ? "center" : "start"} gap="3">
          <Box width="7" height="7" rounded="lg" bg={active ? "cyan.400" : "rgba(148, 163, 184, 0.14)"} color={active ? "gray.950" : "gray.200"} display="grid" placeItems="center" fontSize="xs" fontWeight="900">{item.mark}</Box>
          <Text fontWeight="700" fontSize="sm">{item.label}</Text>
        </HStack>
      </Link>
    </Box>
  );
}

function ShellContent({ children }) {
  const { state, error, notice, logout } = useDashboard();

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
        <Box px="2" py="3" mb="7">
          <Text color="cyan.300" fontWeight="900" fontSize="xs" letterSpacing="0.18em">WARP TUNNEL</Text>
          <Text color="gray.50" fontWeight="800" fontSize="lg" mt="1">Config Manager</Text>
        </Box>
        <Stack gap="2">{navItems.map(item => <NavItem key={item.href} item={item} />)}</Stack>
        <Box mt="auto" p="4" rounded="2xl" bg="rgba(15, 23, 42, 0.58)" borderWidth="1px" borderColor="rgba(148, 163, 184, 0.14)">
          <Text color="gray.400" fontSize="xs">Connected through Jellyfin</Text>
          <Text color="gray.100" fontWeight="700" mt="1" truncate>{state?.current_user || "Loading user"}</Text>
        </Box>
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
          <HStack bg="rgba(15, 23, 42, 0.66)" borderWidth="1px" borderColor="rgba(148, 163, 184, 0.16)" backdropFilter="blur(18px)" rounded="2xl" p="1" gap="1">
            {navItems.map(item => <NavItem key={item.href} item={item} compact />)}
          </HStack>
        </Box>

        <Container maxW="7xl" px={{ base: "4", md: "7" }} py={{ base: "6", md: "9" }}>
          {error && <Alert.Root status="error" mb="5" rounded="xl" bg="rgba(127, 29, 29, 0.55)" color="red.50"><Alert.Indicator /><Alert.Title>{error}</Alert.Title></Alert.Root>}
          {notice && <Alert.Root status="success" mb="5" rounded="xl" bg="rgba(6, 78, 59, 0.55)" color="green.50"><Alert.Indicator /><Alert.Title>{notice}</Alert.Title></Alert.Root>}
          {state && !state.current_user_is_admin && <Alert.Root status="warning" mb="5" rounded="xl" bg="rgba(120, 53, 15, 0.56)" color="orange.50"><Alert.Indicator /><Alert.Title>A Jellyfin administrator account is required to change settings or update the config.</Alert.Title></Alert.Root>}
          {state?.pending_apply && <Alert.Root status="warning" mb="5" rounded="xl" bg="rgba(120, 53, 15, 0.56)" color="orange.50"><Alert.Indicator /><Alert.Title>The selected config is not active in the running VPN tunnel. Check the host manager and VPN container logs.</Alert.Title></Alert.Root>}
          {children}
        </Container>
      </Box>
    </Box>
  );
}

export function DashboardShell({ children }) {
  return <DashboardProvider><ShellContent>{children}</ShellContent></DashboardProvider>;
}
