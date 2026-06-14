# Security fix notes

This branch synchronizes package.json with package-lock.json to unblock Dependabot security updates.

Dependabot failed because package.json referenced @radix-ui/react-dropdown-menu@^2.1.20, which npm could not resolve.

After this PR is merged, rerun Dependabot for esbuild and uuid alerts.
