const getBodyName = (bodyNames, body, level) => {
  bodyNames.push({ name: body.name, level });
  body.satellites.forEach((satellite) => {
    getBodyName(bodyNames, satellite, level + 1);
  });
};
const getBodyNames = (body) => {
  const bodyNames = [];
  getBodyName(bodyNames, body, -1);
  bodyNames[0].level = 0;
  return bodyNames;
};
export default getBodyNames;
