import * as fs from "fs";
import * as papa from "papaparse";

const CURRENCY_COL = "[CURRENCY]";
const CURRENCY_TOKEN = "{currency}";

type CsvField = { [key: string]: number | string };

/** Takes the input CSV and applied the inflation/currency conversion to any columns with CURRENCY_COL in the name,
 * and removes any columns of data in the 'columnsToRemove' list
 */
const applyCurrencyConversionAndColFiltering = (
  csvString: string,
  inflationFactor: number,
  exchangeRate: number,
  currencyCode: string,
  columnsToRemove: string[],
  useFullPrecision: boolean,
  startYearForGranularData: number,
  startMonthForGranulaData: number
): string => {
  const isNumberField = (value: string | number): value is number => {
    return !isNaN(value as number);
  };

  // Parse the CSV file (need to trim any trailing space/CRs to ensure we don't add any empty row in when un-parsing)
  let data = papa.parse(csvString.trim(), {
    header: true,
    dynamicTyping: true,
  });
  let convertedData: CsvField[] = [];

  // Loop through data and apply currency conversion where [CURRENCY] keyword is in the key
  data.data.forEach((row: CsvField) => {
    let convertedRow = {} as CsvField;

    if (
      !filterRowFromYear(
        row,
        startYearForGranularData,
        startMonthForGranulaData
      )
    ) {
      for (let col in row) {
        // Remove the 'CURRENCY' token from any column names - this
        // is applied to know which fields to apply conversion to
        const convertedColumnName = col.replace(CURRENCY_COL, "");
        const isYearColumn: boolean =
          convertedColumnName.toLowerCase() === "year";

        const isMonthColumn: boolean =
          convertedColumnName.toLowerCase() === "month";

        const isTimeColumn: boolean =
          convertedColumnName.toLowerCase() === "time (utc)";

        if (!columnsToRemove.includes(convertedColumnName)) {
          // Only include columns not in the 'columnsToRemove' list
          let value = row[col];

          // papaparse does not treat scientific notation (e.g. 5.01E-05) as a number - so this converts it to ensure its a number
          if (value !== null && !isNaN(value as number))
            value = parseFloat(value as string);

          // all data in headerless columns goes into an array. discard all data in these columns
          if (col === "__parsed_extra") {
            convertedRow[convertedColumnName] = null;
          }
          // Just take the value if its a null or the year column (which we never want to process)
          else if (value === null || isYearColumn) {
            convertedRow[convertedColumnName] = value;
          }
          // Apply currency conversion to numeric fields
          else if (col.startsWith(CURRENCY_COL) && isNumberField(value)) {
            const currencyValue = value * inflationFactor * exchangeRate;

            convertedRow[convertedColumnName] = useFullPrecision
              ? currencyValue
              : roundTo1dpString(currencyValue);
          }
          // Round to 1dp if its a number
          else if (isNumberField(value)) {
            convertedRow[convertedColumnName] = useFullPrecision
              ? value
              : roundTo1dpString(value);
          }
          // its a string so replace any currency tokens (e.g. '{currency}' replaced with 'gbp2019 real')
          else {
            convertedRow[convertedColumnName] = (value as string).replace(
              CURRENCY_TOKEN,
              currencyCode.toUpperCase()
            );
          }
        }
      }

      convertedData.push(convertedRow);
    }
  });

  // Convert back to CSV file
  let convertedCsv = papa.unparse(convertedData);

  return convertedCsv;
};

const roundTo1dpString = (num: number) => {
  return (Math.round((num + Number.EPSILON) * 10) / 10).toFixed(1);
};

const mapMonthNameToNumber: { [monthName: string]: number } = {
  January: 0,
  February: 1,
  March: 2,
  April: 3,
  May: 4,
  June: 5,
  July: 6,
  August: 7,
  September: 8,
  October: 9,
  November: 10,
  December: 11,
};

const filterRowFromYear = (
  row: CsvField,
  startYearForGranularData: number,
  startMonthForGranularData: number
) => {
  if (!startYearForGranularData) return false;

  const year = row["Year"];

  const month: string = row["Month"] as string;
  const utcTimeString = row["Time (UTC)"];

  if (year && month) {
    if (year < startYearForGranularData) {
      return true;
    } else if (
      year === startYearForGranularData &&
      mapMonthNameToNumber[month] < startMonthForGranularData
    ) {
      return true;
    }
  } else if (utcTimeString) {
    const utcTime = new Date(utcTimeString);
    const fullYear = utcTime.getUTCFullYear();
    if (fullYear < startYearForGranularData) {
      return true;
    } else if (fullYear === startYearForGranularData) {
      const utcMonth = utcTime.getUTCMonth();

      if (utcMonth < startMonthForGranularData) {
        return true;
      }
    }
  }

  return false;
};

// Main function
if (require.main === module) {
  const dataFile = fs.createReadStream("data/data_small.csv");
  console.log(dataFile);
  // console.time("applyCurrencyConversionAndColFiltering");
  // applyCurrencyConversionAndColFiltering();
  // console.timeEnd("applyCurrencyConversionAndColFiltering");
}
