import FinancePortfolios from '../components/admin/FinancePortfolios'

/**
 * Lo que ve el administrador al entrar a pagos: quién está cobrando.
 *
 * Antes tenía una segunda pestaña con la actividad de los vendedores, que se
 * movió a Analítica — medir gestión comercial es analítica, y pagos es cobro.
 * Con una sola vista ya no hacen falta pestañas.
 *
 * El administrador no tiene cartera propia: mira las ajenas, y sólo mira.
 */
export default function AdminPortfoliosPage() {
  return (
    <div className="p-6 sm:p-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Cobro</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Cartera de bootcampers por responsable de Finanzas. Sólo consulta.
        </p>
      </header>

      <FinancePortfolios />
    </div>
  )
}
