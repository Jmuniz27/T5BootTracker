"""Validators for authentication app."""


def validate_cedula_ecuatoriana(cedula: str) -> bool:
    """Validate an Ecuadorian national ID (cédula) using mod-10 algorithm."""
    if not cedula or not cedula.isdigit() or len(cedula) != 10:
        return False
    provincia = int(cedula[:2])
    if not (1 <= provincia <= 24):
        return False
    if int(cedula[2]) >= 6:
        return False
    coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2]
    suma = 0
    for i, c in enumerate(coeficientes):
        v = int(cedula[i]) * c
        if v >= 10:
            v -= 9
        suma += v
    dv = int(cedula[9])
    r = suma % 10
    return (r == 0 and dv == 0) or (r != 0 and (10 - r) == dv)


def _mod11_check_digit(digits, coeficientes):
    """Shared mod-11 verifier for RUC sociedad privada / entidad pública."""
    suma = sum(int(d) * c for d, c in zip(digits, coeficientes))
    r = suma % 11
    dv_esperado = 0 if r == 0 else 11 - r
    return None if dv_esperado == 10 else dv_esperado


def _validate_ruc_natural(ruc: str) -> bool:
    """RUC de persona natural: cédula válida en los primeros 10 dígitos + '001'."""
    return validate_cedula_ecuatoriana(ruc[:10]) and ruc.endswith('001')


def _validate_ruc_sociedad_privada(ruc: str) -> bool:
    """RUC de sociedad privada (tercer dígito 9): mod-11 sobre los primeros 9 dígitos."""
    dv_esperado = _mod11_check_digit(ruc[:9], [4, 3, 2, 7, 6, 5, 4, 3, 2])
    return dv_esperado is not None and int(ruc[9]) == dv_esperado


def _validate_ruc_publico(ruc: str) -> bool:
    """RUC de entidad pública (tercer dígito 6): mod-11 sobre los primeros 8 dígitos."""
    dv_esperado = _mod11_check_digit(ruc[:8], [3, 2, 7, 6, 5, 4, 3, 2])
    return dv_esperado is not None and int(ruc[8]) == dv_esperado


def validate_ruc(ruc: str) -> bool:
    """Validate an Ecuadorian RUC (13 digits) — natural, público o sociedad privada."""
    if not ruc or not ruc.isdigit() or len(ruc) != 13:
        return False
    provincia = int(ruc[:2])
    if not (1 <= provincia <= 24):
        return False
    tercer_digito = int(ruc[2])
    if tercer_digito <= 5:
        return _validate_ruc_natural(ruc)
    if tercer_digito == 6:
        return _validate_ruc_publico(ruc)
    if tercer_digito == 9:
        return _validate_ruc_sociedad_privada(ruc)
    return False


def validate_identificacion(valor: str) -> bool:
    """Validate a cédula (10 digits) or RUC (13 digits) by dispatching on length."""
    if not valor or not valor.isdigit():
        return False
    if len(valor) == 10:
        return validate_cedula_ecuatoriana(valor)
    if len(valor) == 13:
        return validate_ruc(valor)
    return False
