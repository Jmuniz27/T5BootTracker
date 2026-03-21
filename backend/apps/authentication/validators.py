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
