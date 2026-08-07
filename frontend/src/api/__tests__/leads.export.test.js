import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const client = (await import('../client')).default;
const { getAllLeads } = await import('../leads.api');

/** Respuesta del listado con una sola partición poblada. */
const pagina = (bucket, rows, totalPages) => ({
  data: { [bucket]: rows, pagination: { [`${bucket}_total_pages`]: totalPages } },
});

describe('getAllLeads', () => {
  beforeEach(() => vi.clearAllMocks());

  it('recorre todas las páginas de la partición', async () => {
    client.get
      .mockResolvedValueOnce(pagina('all_leads', [{ id: 1 }, { id: 2 }], 3))
      .mockResolvedValueOnce(pagina('all_leads', [{ id: 3 }], 3))
      .mockResolvedValueOnce(pagina('all_leads', [{ id: 4 }], 3));

    const { rows, truncated } = await getAllLeads('all_leads');

    expect(client.get).toHaveBeenCalledTimes(3);
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3, 4]);
    expect(truncated).toBe(false);
  });

  it('arrastra los filtros de la pantalla a todas las páginas', async () => {
    client.get.mockResolvedValue(pagina('my_leads', [], 1));

    await getAllLeads('my_leads', { status: 'INTERESTED', search: 'ana' });

    const { params } = client.get.mock.calls[0][1];
    expect(params).toMatchObject({ status: 'INTERESTED', search: 'ana', page: 1 });
  });

  it('sólo acumula la partición pedida', async () => {
    // Juntarlas duplicaría leads: un lead asignado está en `all` y en `assigned`.
    client.get.mockResolvedValue({
      data: {
        all_leads: [{ id: 'a' }],
        assigned_leads: [{ id: 'a' }],
        pagination: { assigned_leads_total_pages: 1 },
      },
    });

    const { rows } = await getAllLeads('assigned_leads');
    expect(rows).toHaveLength(1);
  });

  it('avisa cuando el dataset excede el tope de páginas', async () => {
    client.get.mockResolvedValue(pagina('all_leads', [{ id: 1 }], 999));

    const { truncated } = await getAllLeads('all_leads');

    // No se trunca en silencio: quien llama tiene que poder avisarlo.
    expect(truncated).toBe(true);
    expect(client.get).toHaveBeenCalledTimes(50);
  });

  it('rechaza una partición que no existe en vez de exportar vacío', async () => {
    await expect(getAllLeads('inventada')).rejects.toThrow(/desconocida/i);
    expect(client.get).not.toHaveBeenCalled();
  });
});
