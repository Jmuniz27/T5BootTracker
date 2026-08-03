import RoleRoute from './RoleRoute';

export default function SalespersonRoute({ children }) {
  return <RoleRoute allow={['SALESPERSON']}>{children}</RoleRoute>;
}
