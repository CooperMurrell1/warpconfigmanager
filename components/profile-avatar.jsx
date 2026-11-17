"use client";

import { Box, Text } from "@chakra-ui/react";
import { useState } from "react";

export function ProfileAvatar({ name, size = "10", className }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || "J").trim().slice(0, 1).toUpperCase();

  return (
    <Box
      className={className}
      width={size}
      height={size}
      flexShrink="0"
      rounded="full"
      overflow="hidden"
      borderWidth="1px"
      borderColor="rgba(103, 232, 249, 0.5)"
      bg="rgba(8, 145, 178, 0.28)"
      display="grid"
      placeItems="center"
      boxShadow="0 8px 24px rgba(6, 182, 212, 0.18)"
    >
      {!failed ? (
        <Box
          as="img"
          src="/api/auth/avatar"
          alt={`${name || "Jellyfin user"} profile`}
          width="100%"
          height="100%"
          objectFit="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text color="cyan.100" fontWeight="800" fontSize={size === "24" ? "3xl" : "sm"}>{initial}</Text>
      )}
    </Box>
  );
}
