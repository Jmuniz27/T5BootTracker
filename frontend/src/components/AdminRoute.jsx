import RoleRoute from './RoleRoute';

export default function AdminRoute({ children }) {
  return <RoleRoute allow={['ADMINISTRATOR']}>{children}</RoleRoute>;
}
