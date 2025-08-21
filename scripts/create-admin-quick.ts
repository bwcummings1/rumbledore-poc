#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import chalk from 'chalk';

const prisma = new PrismaClient();

async function createAdminUser() {
  console.log(chalk.blue('\n🛡️  Creating Admin User...\n'));

  try {
    // Check if admin user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: 'admin@rumbledore.com' },
          { username: 'admin' }
        ]
      },
    });

    if (existingUser) {
      console.log(chalk.yellow('ℹ️  Admin user already exists'));
      
      // Update existing user to be admin
      if (existingUser.email === 'admin@rumbledore.local') {
        const hashedPassword = await bcrypt.hash('adminpass123', 10);
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            email: 'admin@rumbledore.com',
            password: hashedPassword,
          },
        });
        console.log(chalk.green('✅ Updated existing user to admin'));
      }
      
      // Check and assign role
      let superAdminRole = await prisma.role.findUnique({
        where: { name: 'SUPER_ADMIN' },
      });

      if (!superAdminRole) {
        superAdminRole = await prisma.role.create({
          data: {
            name: 'SUPER_ADMIN',
            description: 'Super administrator with full system access',
          },
        });
      }

      const existingRole = await prisma.userRole.findFirst({
        where: {
          userId: existingUser.id,
          roleId: superAdminRole.id,
        },
      });

      if (!existingRole) {
        await prisma.userRole.create({
          data: {
            userId: existingUser.id,
            roleId: superAdminRole.id,
          },
        });
        console.log(chalk.green('✅ Assigned SUPER_ADMIN role'));
      }

      console.log(chalk.green('\n✅ Admin user setup complete!\n'));
      console.log(chalk.white('📧 Email: ') + chalk.cyan('admin@rumbledore.com'));
      console.log(chalk.white('🔑 Password: ') + chalk.cyan('adminpass123'));
      console.log(chalk.white('👤 Username: ') + chalk.cyan('admin'));
      console.log(chalk.white('🛡️  Role: ') + chalk.cyan('SUPER_ADMIN'));
      
      await prisma.$disconnect();
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('adminpass123', 10);

    // Create admin user
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@rumbledore.com',
        username: 'admin',
        displayName: 'Admin User',
        password: hashedPassword,
        emailVerified: new Date(),
      },
    });

    // Check if super admin role exists
    let superAdminRole = await prisma.role.findUnique({
      where: { name: 'SUPER_ADMIN' },
    });

    // Create role if it doesn't exist
    if (!superAdminRole) {
      superAdminRole = await prisma.role.create({
        data: {
          name: 'SUPER_ADMIN',
          description: 'Super administrator with full system access',
        },
      });
    }

    // Assign role to user
    await prisma.userRole.create({
      data: {
        userId: adminUser.id,
        roleId: superAdminRole.id,
      },
    });

    console.log(chalk.green('\n✅ Admin user created successfully!\n'));
    console.log(chalk.white('📧 Email: ') + chalk.cyan('admin@rumbledore.com'));
    console.log(chalk.white('🔑 Password: ') + chalk.cyan('adminpass123'));
    console.log(chalk.white('👤 Username: ') + chalk.cyan('admin'));
    console.log(chalk.white('🛡️  Role: ') + chalk.cyan('SUPER_ADMIN'));
    console.log(chalk.yellow('\n⚠️  Please change the password after first login!\n'));

  } catch (error) {
    console.error(chalk.red('❌ Error creating admin user:'), error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdminUser();