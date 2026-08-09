// 5. Задел на будущее (Функции-заглушки)

// GenerateTravelRoute
export const generateTravelRoute = async (req, res) => {
  try {
    const { locations, durationDays } = req.body;

    return res.json({
      status: 'stub',
      message: 'Функция генерации туристического маршрута находится в разработке.',
      suggestedRoute: [
        { day: 1, spot: 'Прибытие и ознакомление с визит-центром', lat: 53.085, lng: 70.301 },
        { day: 2, spot: 'Поход по природному парку Бурабай', lat: 53.092, lng: 70.285 },
        { day: 3, spot: 'Экскурсия по историческим местам и подведение итогов', lat: 53.078, lng: 70.312 },
      ],
      inputLocations: locations || [],
      durationDays: durationDays || 3,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Ошибка сервера при генерации маршрута.' });
  }
};

// CalculateTripCost
export const calculateTripCost = async (req, res) => {
  try {
    const { routeId, travelersCount } = req.body;
    const count = parseInt(travelersCount) || 1;

    return res.json({
      status: 'stub',
      message: 'Функция расчета стоимости поездки находится в разработке.',
      currency: 'KZT',
      estimatedTotal: 45000 * count,
      breakdown: [
        { category: 'Транспорт (автобус / поезд)', amountKZT: 15000 * count },
        { category: 'Проживание (3 дня / 2 ночи)', amountKZT: 20000 * count },
        { category: 'Питание и входы в национальный парк', amountKZT: 10000 * count },
      ],
    });
  } catch (error) {
    return res.status(500).json({ error: 'Ошибка сервера при расчете стоимости.' });
  }
};
