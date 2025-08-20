#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import prompts from 'prompts';
import chalk from 'chalk';
import ora from 'ora';

const prisma = new PrismaClient();

async function createAdminUser() {
  console.log(chalk.blue('\n🛡️  Rumbledore Admin User Creation\n'));

  // Prompt for user details
  const response = await prompts([
    {
      type: 'text',
      name: 'email',
      message: 'Admin email:',
      validate: (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email) || 'Please enter a valid email';
      },
    },
    {
      type: 'text',
      name: 'username',
      message: 'Username:',
      validate: (username) => username.length >= 3 || 'Username must be at least 3 characters',
    },
    {
      type: 'text',
      name: 'displayName',
      message: 'Display name (optional):',
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password:',
      validate: (password) => password.length >= 8 || 'Password must be at least 8 characters',
    },
    {
      type: 'password',
      name: 'confirmPassword',
      message: 'Confirm password:',
      validate: (confirmPassword, values) => 
        confirmPassword === values.password || 'Passwords do not match',
    },
    {
      type: 'select',
      name: 'role',
      message: 'Select admin role:',
      choices: [
        { title: 'Super Admin (Full system access)', value: 'SUPER_ADMIN' },
        { title: 'League Owner (Full league control)', value: 'LEAGUE_OWNER' },
        { title: 'League Admin (League management)', value: 'LEAGUE_ADMIN' },
      ],
    },
  ]);

  if (!response.email || !response.password) {
    console.log(chalk.red('\n❌ Admin creation cancelled'));
    process.exit(0);
  }

  const spinner = ora('Creating admin user...').start();

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: response.email },
          { username: response.username },
        ],
      },
    });

    if (existingUser) {
      spinner.fail(chalk.red('User with this email or username already exists'));
      process.exit(1);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(response.password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: response.email,
        username: response.username,
        displayName: response.displayName || response.username,
        password: hashedPassword,
        emailVerified: new Date(),
      },
    });

    spinner.text = 'Creating role and permissions...';

    // Ensure role exists
    let role = await prisma.role.findUnique({
      where: { name: response.role },
    });

    if (!role) {
      // Create role if it doesn't exist
      role = await prisma.role.create({
        data: {
          name: response.role,
          description: `${response.role} role`,
        },
      });

      // Create default permissions for the role
      const permissions = await createDefaultPermissions(response.role);
      
      // Assign permissions to role
      await prisma.rolePermission.createMany({
        data: permissions.map(p => ({
          roleId: role!.id,
          permissionId: p.id,
        })),
      });
    }

    // Assign role to user
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
      },
    });

    // Log the creation
    await prisma.auditLog.create({
      data: {
        action: 'CREATE_ADMIN',
        entityType: 'USER',
        entityId: user.id,
        metadata: {
          email: user.email,
          role: response.role,
        },
      },
    });

    spinner.succeed(chalk.green('Admin user created successfully!'));

    console.log('\n' + chalk.blue('📋 Admin Details:'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(`Email:    ${chalk.white(user.email)}`);
    console.log(`Username: ${chalk.white(user.username)}`);
    console.log(`Role:     ${chalk.yellow(response.role)}`);
    console.log(`ID:       ${chalk.gray(user.id)}`);
    console.log(chalk.gray('─'.repeat(40)));
    console.log('\n' + chalk.green('✅ You can now login at /admin/login'));

  } catch (error) {
    spinner.fail(chalk.red('Failed to create admin user'));
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function createDefaultPermissions(roleName: string) {
  const permissionList = getPermissionsForRole(roleName);
  const permissions = [];

  for (const p of permissionList) {
    let permission = await prisma.permission.findUnique({
      where: { name: p.name },
    });

    if (!permission) {
      permission = await prisma.permission.create({
        data: p,
      });
    }

    permissions.push(permission);
  }

  return permissions;
}

function getPermissionsForRole(roleName: string) {
  const allPermissions = [
    { name: 'system.manage', resource: 'system', action: 'manage', description: 'Manage system settings' },
    { name: 'leagues.create', resource: 'leagues', action: 'create', description: 'Create leagues' },
    { name: 'leagues.delete', resource: 'leagues', action: 'delete', description: 'Delete leagues' },
    { name: 'leagues.update', resource: 'leagues', action: 'update', description: 'Update leagues' },
    { name: 'leagues.view', resource: 'leagues', action: 'view', description: 'View leagues' },
    { name: 'members.invite', resource: 'members', action: 'invite', description: 'Invite members' },
    { name: 'members.remove', resource: 'members', action: 'remove', description: 'Remove members' },
    { name: 'members.update', resource: 'members', action: 'update', description: 'Update members' },
    { name: 'sync.trigger', resource: 'sync', action: 'trigger', description: 'Trigger data sync' },
    { name: 'sync.view', resource: 'sync', action: 'view', description: 'View sync status' },
    { name: 'stats.recalculate', resource: 'stats', action: 'recalculate', description: 'Recalculate statistics' },
    { name: 'identity.manage', resource: 'identity', action: 'manage', description: 'Manage identity resolution' },
    { name: 'settings.update', resource: 'settings', action: 'update', description: 'Update settings' },
  ];

  switch (roleName) {
    case 'SUPER_ADMIN':
      return allPermissions;
    case 'LEAGUE_OWNER':
      return allPermissions.filter(p => p.resource !== 'system');
    case 'LEAGUE_ADMIN':
      return allPermissions.filter(p => 
        ['members.invite', 'sync.trigger', 'sync.view', 'stats.recalculate'].includes(p.name)
      );
    default:
      return [];
  }
}

// Run the script
createAdminUser().catch((error) => {
  console.error(chalk.red('Error:'), error);
  process.exit(1);
});