import { UserRole } from '../../user/user-role.enum';

export interface UserContext {
	userId: string;
	role: UserRole;
}

export function isAdminRole(role: UserRole): boolean {
	return role === UserRole.SuperAdmin || role === UserRole.Admin;
}
